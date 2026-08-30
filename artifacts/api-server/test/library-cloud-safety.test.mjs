import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test, { mock } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { testDbState } from "@workspace/db";
import driveRouter from "../src/routes/drive.ts";
import libraryRouter from "../src/routes/library.ts";
import sheetsRouter from "../src/routes/sheets.ts";

const workspaceRoot = resolve(new URL("../../..", import.meta.url).pathname);
const libraryRoot = resolve(workspaceRoot, "artifacts/project-apps-library");
const librarySource = readFileSync(resolve(libraryRoot, "src/App.tsx"), "utf8");
const syncPageSource = readFileSync(resolve(workspaceRoot, "artifacts/stop-loss-app/src/pages/sync.tsx"), "utf8");
const opportunitiesSource = readFileSync(resolve(workspaceRoot, "artifacts/stop-loss-app/src/pages/opportunities.tsx"), "utf8");
const standaloneCloudSource = readFileSync(resolve(workspaceRoot, "artifacts/stop-loss-app/public/cloud-sync.js"), "utf8");

const drive = {
  files: [
    {
      id: "drive-live-1",
      name: "Renewal packet.pdf",
      mimeType: "application/pdf",
      size: "2048",
      modifiedTime: "2026-08-29T11:30:00.000Z",
      webViewLink: "https://drive.google.com/file/d/drive-live-1/view",
      parents: ["folder-1"],
    },
  ],
  contents: new Map([["drive-live-1", Buffer.from("live drive content")]]),
  uploadCount: 0,
  permissionCount: 0,
};

const sheets = {
  metadata: {
    properties: {
      title: "Project Apps Library",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-test-123/edit",
    },
    sheets: [],
  },
  writeFailure: true,
  valuesByTab: new Map(),
  batchUpdateCount: 0,
  batchClearCount: 0,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function documentIdFromPath(pathname) {
  const match = pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

mock.method(ReplitConnectors.prototype, "proxy", async (connection, path, options = {}) => {
  const url = new URL(`https://connector.test${path}`);
  const method = options.method ?? "GET";

  if (connection === "google-sheet") {
    if (method !== "GET" && sheets.writeFailure) {
      return jsonResponse({ message: "The connected workbook is read-only." }, 403);
    }
    if (url.pathname.endsWith("/values:batchGet")) {
      const ranges = url.searchParams.getAll("ranges");
      return jsonResponse({
        valueRanges: ranges.map((range) => {
          const name = range.match(/^'(.+)'$/)?.[1]?.replace(/''/g, "'") ?? range;
          return { values: sheets.valuesByTab.get(name) ?? [] };
        }),
      });
    }
    if (url.pathname.includes("/values:batchUpdate")) {
      sheets.batchUpdateCount += 1;
      const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      for (const entry of body?.data ?? []) {
        const name = String(entry.range || "").match(/^'(.+)'!/)?.[1]?.replace(/''/g, "'");
        if (name) sheets.valuesByTab.set(name, entry.values ?? []);
      }
      return jsonResponse({});
    }
    if (url.pathname.includes("/values:batchClear")) {
      sheets.batchClearCount += 1;
      return jsonResponse({});
    }
    return jsonResponse(sheets.metadata);
  }

  assert.equal(connection, "google-drive");
  if (path.includes("/permissions")) {
    drive.permissionCount += 1;
    return jsonResponse({ id: "unexpected-permission" });
  }

  if (path.startsWith("/upload/drive/v3/files")) {
    drive.uploadCount += 1;
    const multipartBody = Buffer.isBuffer(options.body) ? options.body.toString("utf8") : String(options.body || "");
    const operationMatch = multipartBody.match(/"tinubuOperationId"\s*:\s*"([^"]+)"/);
    const uploaded = {
      id: "drive-uploaded-1",
      name: "library-backup.json",
      mimeType: "application/json",
      size: "128",
      modifiedTime: "2026-08-29T11:45:00.000Z",
      webViewLink: "https://drive.google.com/file/d/drive-uploaded-1/view",
      parents: [],
      ...(operationMatch ? { appProperties: { tinubuOperationId: operationMatch[1] } } : {}),
    };
    drive.files.unshift(uploaded);
    drive.contents.set(uploaded.id, Buffer.from("uploaded backup"));
    return jsonResponse(uploaded);
  }

  if (url.searchParams.get("alt") === "media") {
    const content = drive.contents.get(documentIdFromPath(url.pathname));
    return content
      ? new Response(content, { headers: { "content-type": "application/json" } })
      : jsonResponse({ error: { message: "File not found" } }, 404);
  }

  if (url.searchParams.has("q")) {
    const query = url.searchParams.get("q") || "";
    const operationMatch = query.match(/key = 'tinubuOperationId' and value = '([^']+)'/);
    return jsonResponse({
      files: operationMatch
        ? drive.files.filter((file) => file.appProperties?.tinubuOperationId === operationMatch[1])
        : drive.files,
    });
  }

  const documentId = documentIdFromPath(url.pathname);
  if (documentId) {
    const file = drive.files.find((candidate) => candidate.id === documentId);
    return file
      ? jsonResponse(file)
      : jsonResponse({ error: { message: "File not found" } }, 404);
  }

  throw new Error(`Unexpected mocked Drive request: ${method} ${path}`);
});

testDbState.config = {
  id: 1,
  spreadsheetId: "sheet-test-123",
  spreadsheetUrl: sheets.metadata.properties.spreadsheetUrl,
  title: sheets.metadata.properties.title,
  lastSyncedAt: null,
  writeVerifiedAt: null,
};

function createApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req, res, next) => {
    if (req.headers.authorization !== "Bearer authenticated-test-session") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = "authenticated-test-user";
    next();
  });
  app.use(libraryRouter);
  app.use(sheetsRouter);
  app.use(driveRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message || "Internal test error" });
  });
  return app;
}

const server = createApp().listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(() => {
  server.close();
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: "Bearer authenticated-test-session",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes("json") ? await response.json() : await response.text(),
  };
}

test("public catalog discovery stays local until protected enrichment is authorized", async () => {
  const response = await request("/library/catalog");

  assert.equal(response.status, 200);
  assert.ok(response.body.artifacts.some((artifact) => artifact.slug === "project-apps-library"));
  assert.deepEqual(response.body.records, []);
  assert.deepEqual(response.body.driveFiles, []);
  assert.equal(response.body.sources.sheets.state, "local");
  assert.equal(response.body.sources.drive.state, "local");
  assert.match(response.body.sources.sheets.message, /sign in/i);
});

test("a failed Sheets push leaves local configuration untouched and the UI names the unsaved state", async () => {
  const snapshot = await request("/sheets/snapshot");
  const before = { ...testDbState.config };
  const localRecord = {
    id: "local-1",
    title: "Local record retained",
    type: "output",
    status: "active",
    description: "Must remain available after a failed cloud write.",
    artifactSlug: null,
    artifactUrl: null,
    tags: ["local"],
    updatedAt: null,
    driveFileId: null,
    driveWebViewLink: null,
  };
  const response = await request("/sheets/sync", {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: snapshot.body.revision,
      tabs: [{ name: "Project Library", rows: [localRecord] }],
    }),
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /read-only/i);
  assert.deepEqual(testDbState.config, before);
  assert.match(librarySource, /The library was not written to Sheets/);
  assert.match(librarySource, /Keep the local cache and retry later/);
  assert.match(librarySource, /setLocalRecords\(next\)/);
});

test("a Sheets sync without a revision is rejected before any mutation", async () => {
  sheets.batchClearCount = 0;
  sheets.batchUpdateCount = 0;
  const response = await request("/sheets/sync", {
    method: "POST",
    body: JSON.stringify({
      tabs: [{ name: "Project Library", rows: [{ id: "blind-1", title: "Blind overwrite" }] }],
    }),
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /revision is required/i);
  assert.match(response.body.error, /no workbook data was changed/i);
  assert.equal(sheets.batchClearCount, 0);
  assert.equal(sheets.batchUpdateCount, 0);
});

test("a stale authenticated library push cannot replace a newer Sheets revision", async () => {
  sheets.writeFailure = false;
  sheets.metadata.sheets = [
    { properties: { title: "Project Library" } },
    { properties: { title: "Auxiliary" } },
  ];
  sheets.batchUpdateCount = 0;
  sheets.batchClearCount = 0;
  sheets.valuesByTab.set("Project Library", [
    ["id", "title", "type", "status"],
    ["shared-1", "Starting record", "output", "active"],
  ]);
  sheets.valuesByTab.set("Auxiliary", [
    ["setting", "value"],
    ["retained", "yes"],
  ]);

  const writerASnapshot = await request("/sheets/snapshot");
  const writerBSnapshot = await request("/sheets/snapshot");
  assert.equal(writerASnapshot.status, 200);
  assert.equal(writerBSnapshot.status, 200);
  assert.equal(writerASnapshot.body.revision, writerBSnapshot.body.revision);

  const writerA = await request("/sheets/sync", {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: writerASnapshot.body.revision,
      tabs: [{
        name: "Project Library",
        rows: [{
          id: "shared-1",
          title: "Writer A newer record",
          type: "output",
          status: "active",
          metadata: { z: 2, a: 1 },
          optionalValue: null,
        }],
      }],
    }),
  });
  assert.equal(writerA.status, 200);
  assert.notEqual(writerA.body.revision, writerASnapshot.body.revision);

  const writerB = await request("/sheets/sync", {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: writerBSnapshot.body.revision,
      tabs: [{
        name: "Project Library",
        rows: [{ id: "shared-1", title: "Writer B stale record", type: "output", status: "active" }],
      }],
    }),
  });
  assert.equal(writerB.status, 409);
  assert.match(writerB.body.error, /newer Google Sheets data/i);
  assert.match(writerB.body.error, /not applied/i);
  assert.match(writerB.body.error, /local records remain available/i);
  assert.equal(sheets.batchUpdateCount, 1);
  assert.equal(sheets.batchClearCount, 1);

  const finalSnapshot = await request("/sheets/snapshot");
  assert.equal(finalSnapshot.status, 200);
  const finalLibrary = finalSnapshot.body.tabs.find((tab) => tab.name === "Project Library");
  const finalAuxiliary = finalSnapshot.body.tabs.find((tab) => tab.name === "Auxiliary");
  assert.equal(finalLibrary.rows[0].title, "Writer A newer record");
  assert.equal(finalSnapshot.body.revision, writerA.body.revision);
  assert.equal(finalLibrary.rows[0].metadata, JSON.stringify({ z: 2, a: 1 }));
  assert.equal(finalLibrary.rows[0].optionalValue, "");
  assert.equal(finalAuxiliary.rows[0].value, "yes");
  assert.match(librarySource, /expectedRevision: appliedRevision/);
  assert.match(librarySource, /const \[appliedRevision, setAppliedRevision\] = useState\(''\)/);
  assert.match(librarySource, /setAppliedRevision\(result\.data\.revision\)/);
  assert.match(librarySource, /onSuccess: \(\) => \{ setAppliedRevision\(''\); setSyncState\('Workbook initialized/);
  assert.doesNotMatch(librarySource, /expectedRevision: snapshot\.revision/);
  assert.match(librarySource, /The cloud write was not applied/);
  assert.match(librarySource, /Keep the local cache and pull the latest workbook before retrying/);
  assert.match(syncPageSource, /expectedRevision: appliedRevision/);
  assert.match(syncPageSource, /setAppliedRevision\(result\.data\.revision\)/);
  assert.doesNotMatch(syncPageSource, /expectedRevision: snapshot\.revision/);
  assert.match(syncPageSource, /The cloud write was not applied; local workspace data remains available/);
  assert.doesNotMatch(opportunitiesSource, /useSyncSheets/);
  assert.match(opportunitiesSource, /saved in the local workspace/);
  assert.match(standaloneCloudSource, /expectedRevision: sheetsRevision/);
  assert.match(standaloneCloudSource, /Pull the latest workbook before pushing/);
  assert.doesNotMatch(standaloneCloudSource, /function queueDynamicSync/);
  assert.doesNotMatch(standaloneCloudSource, /syncCurrentData\(\{ silent: true/);

  sheets.writeFailure = true;
  sheets.metadata.sheets = [];
  sheets.valuesByTab.clear();
});

test("Drive upload and content retrieval work without creating sharing permissions", async () => {
  const upload = await request("/drive/documents", {
    method: "POST",
    body: JSON.stringify({
      name: "library-backup.json",
      mimeType: "application/json",
      contentBase64: Buffer.from("uploaded backup").toString("base64"),
      operationId: "drive-upload-replay-test",
    }),
  });

  assert.equal(upload.status, 200);
  assert.equal(upload.body.id, "drive-uploaded-1");
  assert.equal(upload.body.sharedWithEmail, null);
  assert.equal(drive.uploadCount, 1);
  assert.equal(drive.permissionCount, 0);

  const content = await request("/drive/documents/drive-uploaded-1/content");
  assert.equal(content.status, 200);
  assert.equal(content.body.name, "library-backup.json");
  assert.equal(content.body.contentBase64, Buffer.from("uploaded backup").toString("base64"));
  assert.equal(content.body.mimeType, "application/json");
  assert.equal(drive.permissionCount, 0);

  const retry = await request("/drive/documents", {
    method: "POST",
    body: JSON.stringify({
      name: "library-backup.json",
      mimeType: "application/json",
      contentBase64: Buffer.from("uploaded backup").toString("base64"),
      operationId: "drive-upload-replay-test",
    }),
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, "drive-uploaded-1");
  assert.equal(drive.uploadCount, 1, "a replayed operation ID must not create a duplicate Drive file");
});

test("standalone library build emits one self-contained HTML document", () => {
  execFileSync(
    "pnpm",
    ["--filter", "@workspace/project-apps-library", "run", "build"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "4173",
        BASE_PATH: "/project-apps-library/",
      },
      stdio: "pipe",
    },
  );

  const outputDir = resolve(libraryRoot, "dist/public");
  assert.deepEqual(readdirSync(outputDir), ["index.html"]);
  const html = readFileSync(resolve(outputDir, "index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)=["'](?:\.?\.?\/|\/)(?!\/)/i);
  assert.match(html, /data-inlined-asset="project-apps-library\.js"/);
  assert.match(html, /data-inlined-asset="project-apps-library\.css"/);
});