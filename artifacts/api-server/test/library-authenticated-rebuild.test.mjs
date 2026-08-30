import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test, { mock } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import libraryRouter from "../src/routes/library.ts";

process.env.SESSION_SECRET = "authenticated-library-rebuild-test-secret";
process.env.AUTHORIZED_USER_EMAILS = "operator@example.com";

const workspaceRoot = resolve(new URL("../../..", import.meta.url).pathname);
const stopLossRoot = resolve(workspaceRoot, "artifacts/stop-loss-app");
const buildInputPath = resolve(stopLossRoot, "public/index-reference-runtime.js");
const outputPath = resolve(stopLossRoot, "dist/public/index.html");
const spreadsheetId = "authenticated-library-sheet";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function portableSessionToken(userId = "authenticated-library-test-user") {
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: "authenticated-library-test",
    expiresAt: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

const sessionToken = portableSessionToken();
const sheetRows = [
  ["id", "title", "type", "status", "description", "tags"],
  ["cloud-1", "Authenticated renewal brief", "document", "active", "Loaded from the protected Project Library tab.", '["renewal","cloud"]'],
];
const driveFiles = [{
  id: "drive-library-1",
  name: "Authenticated renewal brief.pdf",
  mimeType: "application/pdf",
  size: "2048",
  modifiedTime: "2026-08-29T11:30:00.000Z",
  webViewLink: "https://drive.google.com/file/d/drive-library-1/view",
  parents: ["library-folder"],
}];

mock.method(ReplitConnectors.prototype, "proxy", async (connection, requestPath) => {
  const url = new URL(`https://connector.test${requestPath}`);
  if (connection === "google-sheet") {
    if (url.pathname.endsWith(`/${spreadsheetId}`)) {
      return jsonResponse({
        properties: {
          title: "Authenticated library workbook",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        },
        sheets: [{ properties: { title: "Project Library" } }],
      });
    }
    if (url.pathname.endsWith("/values:batchGet")) {
      return jsonResponse({ valueRanges: [{ values: sheetRows }] });
    }
    throw new Error(`Unexpected mocked Sheets request: ${requestPath}`);
  }

  assert.equal(connection, "google-drive");
  assert.equal(url.pathname, "/drive/v3/files");
  return jsonResponse({ files: driveFiles });
});

function createApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(libraryRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message || "Unexpected test error" });
  });
  return app;
}

const server = createApp().listen(0);
const serverAddress = server.address();
const baseUrl = `http://127.0.0.1:${serverAddress.port}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-portable-session": sessionToken,
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes("json") ? await response.json() : await response.text(),
  };
}

function assertStandaloneHtml(html) {
  assert.match(html, /<html\b/i);
  assert.match(html, /<body\b/i);
  assert.doesNotMatch(
    html,
    /<(?:script|link|img|iframe|source|video|audio|object)\b[^>]+(?:src|href|data)\s*=\s*["'](?!https?:\/\/|\/\/|data:|blob:|#|mailto:|tel:|javascript:)[^"']+/i,
  );
}

test.after(() => server.close());

test("an allowlisted portable session reads protected catalog enrichment", async () => {
  const response = await request("/library/catalog/enrichment");

  assert.equal(response.status, 200);
  assert.equal(response.body.records[0].title, "Authenticated renewal brief");
  assert.equal(response.body.records[0].tags[0], "renewal");
  assert.equal(response.body.sources.sheets.state, "read_only");
  assert.equal(response.body.sources.drive.state, "connected");
  assert.equal(response.body.driveFiles[0].id, "drive-library-1");
});

test("concurrent authenticated rebuilds publish complete HTML and export freshness metadata", async () => {
  const [first, second] = await Promise.all([
    request("/library/artifacts/stop-loss-app/rebuild", { method: "POST", body: "{}" }),
    request("/library/artifacts/stop-loss-app/rebuild", { method: "POST", body: "{}" }),
  ]);

  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(first.body.state, "current");
  assert.equal(second.body.state, "current");
  assert.ok(first.body.builtAt);
  assert.ok(second.body.builtAt);

  const exported = await request("/library/artifacts/stop-loss-app/export");
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-disposition") || "", /attachment; filename="stop-loss-app\.html"/i);
  assert.equal(exported.headers.get("cache-control"), "no-store");
  assert.ok(exported.headers.get("x-library-build-at"));
  assert.ok(exported.headers.get("x-library-source-modified-at"));
  assert.equal(exported.headers.get("x-library-build-at"), second.body.builtAt);
  assertStandaloneHtml(exported.body);
});

test("a failed authenticated rebuild keeps the prior export and exposes it as stale", async () => {
  const priorExport = await request("/library/artifacts/stop-loss-app/export");
  assert.equal(priorExport.status, 200);
  const priorHtml = priorExport.body;
  const priorBuildAt = priorExport.headers.get("x-library-build-at");
  const priorStat = statSync(buildInputPath);
  const originalInput = readFileSync(buildInputPath, "utf8");

  try {
    writeFileSync(buildInputPath, `${originalInput}\nconst = invalid rebuild input;\n`);
    const failed = await request("/library/artifacts/stop-loss-app/rebuild", {
      method: "POST",
      body: "{}",
    });

    assert.equal(failed.status, 422);
    assert.match(failed.body.error, /invalid inline script/i);
    assert.equal(readFileSync(outputPath, "utf8"), priorHtml);

    // Keep the changed source unambiguously newer than the preserved output.
    // Some filesystems report source and failed-build times within the
    // freshness tolerance used by readArtifactBuild.
    const staleAt = new Date(Date.now() + 10_000);
    utimesSync(buildInputPath, staleAt, staleAt);
    const catalog = await request("/library/catalog");
    assert.equal(catalog.status, 200);
    const artifact = catalog.body.artifacts.find((candidate) => candidate.slug === "stop-loss-app");
    assert.equal(artifact.build.state, "stale");
    assert.equal(artifact.build.downloadUrl, "/api/library/artifacts/stop-loss-app/export");
    assert.equal(artifact.build.builtAt, priorBuildAt);
    assert.equal(artifact.build.size, String(Buffer.byteLength(priorHtml)));

    const blockedExport = await request("/library/artifacts/stop-loss-app/export");
    assert.equal(blockedExport.status, 409);
    assert.match(blockedExport.body.error, /source files changed|stale/i);
  } finally {
    writeFileSync(buildInputPath, originalInput);
    utimesSync(buildInputPath, priorStat.atime, priorStat.mtime);
  }
});