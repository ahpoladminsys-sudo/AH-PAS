import assert from "node:assert/strict";
import test, { mock } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import driveRouter from "../src/routes/drive.ts";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DESTINATION_FOLDER_ID = "destination-billing";

const drive = {
  documents: [],
  folders: [],
  metadata: new Map(),
  moveCount: 0,
  permissionCount: 0,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function folderQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function findFolderFromQuery(query) {
  const name = query.match(/name = '((?:\\'|\\\\|[^'])*)'/)?.[1]
    ?.replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
  const parentId = query.match(/'([^']+)' in parents/)?.[1];
  return drive.folders.find((folder) =>
    folder.name === name && (folder.parents ?? ["root"]).includes(parentId),
  );
}

function documentIdFromPath(pathname) {
  const match = pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

mock.method(ReplitConnectors.prototype, "proxy", async (_connection, path, options = {}) => {
  const url = new URL(`https://drive.test${path}`);
  const query = url.searchParams.get("q") ?? "";
  const method = options.method ?? "GET";

  if (path.includes("/permissions")) {
    drive.permissionCount += 1;
    return jsonResponse({ error: { message: "Permissions API must not be called by migrations." } }, 500);
  }

  if (query && query.includes("mimeType != ")) {
    return jsonResponse({ files: drive.documents });
  }
  if (query && query.includes(`mimeType = '${FOLDER_MIME}'`) && !query.includes("name = ")) {
    return jsonResponse({ files: drive.folders });
  }
  if (query && query.includes("name = ")) {
    const folder = findFolderFromQuery(query);
    return jsonResponse({ files: folder ? [{ id: folder.id, name: folder.name }] : [] });
  }

  const documentId = documentIdFromPath(url.pathname);
  if (documentId && method === "PATCH" && url.searchParams.has("addParents")) {
    const metadata = drive.metadata.get(documentId);
    assert.ok(metadata, `expected metadata for ${documentId}`);
    const destinationId = url.searchParams.get("addParents");
    metadata.parents = [destinationId];
    drive.moveCount += 1;
    return jsonResponse(metadata);
  }
  if (documentId && method === "PATCH") {
    const metadata = drive.metadata.get(documentId);
    assert.ok(metadata, `expected metadata for ${documentId}`);
    metadata.trashed = true;
    return jsonResponse(metadata);
  }
  if (documentId && method === "GET") {
    const metadata = drive.metadata.get(documentId);
    return metadata
      ? jsonResponse(metadata)
      : jsonResponse({ error: { message: "File not found" } }, 404);
  }

  throw new Error(`Unexpected mocked Drive request: ${method} ${path}`);
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use(driveRouter);
  return app;
}

const server = createApp().listen(0);
const serverAddress = server.address();
const baseUrl = `http://127.0.0.1:${serverAddress.port}`;

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function sourceFolder(id = "source-folder") {
  return { id, name: "Unsorted", parents: ["root"] };
}

function destinationFolders() {
  return [
    { id: "destination-policy", name: "POLICY123 - Acme Health", parents: ["root"] },
    { id: "destination-year", name: "2026", parents: ["destination-policy"] },
    { id: DESTINATION_FOLDER_ID, name: "Billing", parents: ["destination-year"] },
  ];
}

function document(id, name, parents = ["source-folder"]) {
  return {
    id,
    name,
    mimeType: "application/pdf",
    webViewLink: `https://drive.google.com/open?id=${id}`,
    parents,
  };
}

function configureDrive(documents, folders = [...destinationFolders(), sourceFolder()]) {
  drive.documents = documents;
  drive.folders = folders;
  drive.metadata = new Map(documents.map((item) => [item.id, { ...item, parents: [...item.parents] }]));
  drive.moveCount = 0;
  drive.permissionCount = 0;
}

const policy = {
  id: "POLICY123",
  name: "Acme Health",
  effectiveYear: "2026",
};

const policies = [policy];

function approvedMove(previewItem) {
  return {
    sourceFileId: previewItem.sourceFileId,
    destinationPath: previewItem.destinationPath,
    destinationFolderId: previewItem.destinationFolderId,
    expectedSourceParentIds: previewItem.sourceParentIds,
  };
}

test.after(() => server.close());

test("migration preview is a dry run, classifies ambiguity, and excludes ambiguous files", async () => {
  configureDrive([
    document("file-proposed", "POLICY123 invoice.pdf"),
    document("file-ambiguous", "ambiguous proposal.pdf"),
  ]);

  const preview = await request("/drive/migrations/preview", {
    policies: [
      policy,
      { ...policy, id: "POLICY456", documentFileIds: ["file-ambiguous"] },
      { ...policy, id: "POLICY789", documentFileIds: ["file-ambiguous"] },
    ],
  });

  assert.equal(preview.status, 200);
  assert.match(preview.body.operationId, /^[0-9a-f-]{36}$/);
  assert.match(preview.body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(preview.body.proposedCount, 1);
  assert.equal(preview.body.ambiguousCount, 1);
  assert.equal(drive.moveCount, 0);
  assert.equal(drive.permissionCount, 0);

  const ambiguous = preview.body.files.find((item) => item.sourceFileId === "file-ambiguous");
  const proposed = preview.body.files.find((item) => item.sourceFileId === "file-proposed");
  assert.equal(ambiguous.decision, "ambiguous");
  assert.match(ambiguous.reason, /Multiple policies/);
  assert.equal(proposed.decision, "proposed");
  assert.equal(proposed.sourceModifiedTime, null);

  const execution = await request("/drive/migrations/execute", {
    approved: true,
    previewId: preview.body.previewId,
    moves: [approvedMove(proposed)],
  });
  assert.equal(execution.status, 200);
  assert.equal(execution.body.movedCount, 1);
  assert.equal(execution.body.results[0].sourceFileId, "file-proposed");
  assert.match(execution.body.operationId, /^[0-9a-f-]{36}$/);
  assert.match(execution.body.decidedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(execution.body.results[0].operationId, execution.body.operationId);
  assert.match(execution.body.results[0].decidedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(execution.body.results[0].destinationFolderId, DESTINATION_FOLDER_ID);
  assert.deepEqual(execution.body.results[0].destinationPath, proposed.destinationPath);
  assert.deepEqual(execution.body.results[0].beforeParentIds, ["source-folder"]);
  assert.deepEqual(execution.body.results[0].afterParentIds, [DESTINATION_FOLDER_ID]);
  assert.equal(drive.moveCount, 1);
  assert.equal(drive.permissionCount, 0);
});

test("migration execution requires explicit approval", async () => {
  configureDrive([]);

  const response = await request("/drive/migrations/execute", {
    approved: false,
    previewId: "not-approved",
    moves: [],
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Explicit approval is required/);
  assert.equal(drive.moveCount, 0);
});

test("expired migration previews cannot be executed", async () => {
  configureDrive([document("file-expiring", "POLICY123 invoice.pdf")]);
  const originalNow = Date.now();
  let now = originalNow;
  const dateMock = mock.method(Date, "now", () => now);

  try {
    const preview = await request("/drive/migrations/preview", { policies });
    now += 15 * 60 * 1000 + 1;
    const response = await request("/drive/migrations/execute", {
      approved: true,
      previewId: preview.body.previewId,
      moves: [],
    });

    assert.equal(response.status, 409);
    assert.match(response.body.error, /preview has expired/);
    assert.equal(drive.moveCount, 0);
  } finally {
    dateMock.mock.restore();
  }
});

test("a stale source parent is reported as a conflict instead of being moved", async () => {
  configureDrive([document("file-stale", "POLICY123 invoice.pdf")]);
  const preview = await request("/drive/migrations/preview", { policies });
  drive.metadata.get("file-stale").parents = ["changed-source-folder"];

  const response = await request("/drive/migrations/execute", {
    approved: true,
    previewId: preview.body.previewId,
    moves: [approvedMove(preview.body.files[0])],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.conflictCount, 1);
  assert.equal(response.body.results[0].status, "conflict");
  assert.equal(drive.moveCount, 0);
  assert.equal(drive.permissionCount, 0);
});

test("repeating an approved request is idempotent and never changes permissions", async () => {
  configureDrive([document("file-repeat", "POLICY123 invoice.pdf")]);
  const preview = await request("/drive/migrations/preview", { policies });
  const move = approvedMove(preview.body.files[0]);

  const first = await request("/drive/migrations/execute", {
    approved: true,
    previewId: preview.body.previewId,
    moves: [move],
  });
  const second = await request("/drive/migrations/execute", {
    approved: true,
    previewId: preview.body.previewId,
    moves: [move],
  });

  assert.equal(first.status, 200);
  assert.equal(first.body.movedCount, 1);
  assert.equal(second.status, 200);
  assert.equal(second.body.alreadyInDestinationCount, 1);
  assert.equal(second.body.results[0].status, "already_in_destination");
  assert.equal(drive.moveCount, 1);
  assert.equal(drive.permissionCount, 0);
});

test("duplicate previews require one direct system-folder parent and known timestamps", async () => {
  const systemFolder = {
    id: "system-folder",
    name: "Tinubu Stop Loss System",
    parents: ["root"],
  };
  configureDrive([
    { ...document("older", "report.pdf", ["system-folder"]), modifiedTime: "2026-01-01T00:00:00.000Z" },
    { ...document("newer", "report.pdf", ["system-folder"]), modifiedTime: "2026-02-01T00:00:00.000Z" },
    { ...document("unknown", "uncertain.pdf", ["system-folder"]), modifiedTime: undefined },
    { ...document("known", "uncertain.pdf", ["system-folder"]), modifiedTime: "2026-02-01T00:00:00.000Z" },
    { ...document("multi-parent", "report.pdf", ["system-folder", "other-folder"]), modifiedTime: "2027-01-01T00:00:00.000Z" },
    { ...document("tie-a", "tie.pdf", ["system-folder"]), modifiedTime: "2026-03-01T00:00:00.000Z" },
    { ...document("tie-b", "tie.pdf", ["system-folder"]), modifiedTime: "2026-03-01T00:00:00.000Z" },
  ], [systemFolder]);

  const preview = await request("/drive/duplicates/preview", {});
  assert.equal(preview.status, 200);
  assert.match(preview.body.operationId, /^[0-9a-f-]{36}$/);
  assert.equal(preview.body.candidateCount, 2);
  assert.equal(preview.body.files.find((item) => item.fileId === "older").decision, "trash_candidate");
  assert.equal(preview.body.files.find((item) => item.fileId === "newer").decision, "retain");
  assert.equal(preview.body.files.find((item) => item.fileId === "multi-parent"), undefined);
  assert.equal(preview.body.files.find((item) => item.fileId === "unknown").decision, "metadata_uncertain");
  assert.equal(preview.body.files.find((item) => item.fileId === "known").decision, "metadata_uncertain");
  assert.equal(preview.body.files.find((item) => item.fileId === "tie-a").decision, "retain");
  assert.equal(preview.body.files.find((item) => item.fileId === "tie-b").retainedFileId, "tie-a");
  assert.equal(drive.permissionCount, 0);

  const duplicateExecution = await request("/drive/duplicates/execute", {
    approved: true,
    previewId: preview.body.previewId,
    fileIds: ["older"],
  });
  assert.equal(duplicateExecution.status, 200);
  assert.equal(duplicateExecution.body.previewId, preview.body.previewId);
  assert.match(duplicateExecution.body.operationId, /^[0-9a-f-]{36}$/);
  assert.match(duplicateExecution.body.decidedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(duplicateExecution.body.results[0].operationId, duplicateExecution.body.operationId);
  assert.match(duplicateExecution.body.results[0].decidedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(drive.permissionCount, 0);
});