import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GetDriveWorkspaceStateResponse,
  SaveDriveWorkspaceStateBody,
} from "@workspace/api-zod";
import {
  decodeWorkspaceState,
  encodeWorkspaceState,
  hasWorkspaceStateConflict,
} from "../src/lib/workspace-state";

const state = {
  schemaVersion: 1,
  updatedAt: "2026-08-29T12:00:00.000Z",
  source: "test",
  systemLog: { indexFiles: [{ id: "idx-1", status: "Pending review" }], events: [] },
  pendingReview: {
    indexReview: {
      candidateId: "idx-1",
      currentId: "idx-0",
      choices: { "Plans|identity:one": false },
      comparison: { mergedData: { tabs: [] } },
    },
    disableIndexId: null,
  },
  sheetsCache: { tabs: [{ name: "Policies", rows: [] }] },
  licensingFallback: { state: { agents: [] }, authoritative: false },
};

test("workspace state envelope validates and survives Drive JSON round-trip", () => {
  const parsed = SaveDriveWorkspaceStateBody.parse({
    state,
    expectedModifiedTime: "2026-08-29T11:00:00.000Z",
  });
  const decoded = decodeWorkspaceState(encodeWorkspaceState(parsed.state));
  assert.deepEqual(decoded, state);
  assert.equal(parsed.expectedModifiedTime?.toISOString(), "2026-08-29T11:00:00.000Z");
});

test("workspace state response validates the Drive revision metadata", () => {
  const response = GetDriveWorkspaceStateResponse.parse({
    fileId: "drive-state-1",
    name: "Tinubu Stop Loss Workspace State.json",
    mimeType: "application/json",
    modifiedTime: "2026-08-29T12:01:00.000Z",
    state,
  });
  assert.equal(response.fileId, "drive-state-1");
  assert.equal(response.state.schemaVersion, 1);
});

test("revision checks allow creates and repeated same-revision updates but block stale writes", () => {
  assert.equal(hasWorkspaceStateConflict(null, undefined), false);
  assert.equal(hasWorkspaceStateConflict("2026-08-29T12:00:00.000Z", "2026-08-29T12:00:00.000Z"), false);
  assert.equal(hasWorkspaceStateConflict("2026-08-29T12:00:00.000Z", "2026-08-29T12:01:00.000Z"), true);
  assert.equal(hasWorkspaceStateConflict("2026-08-29T12:00:00.000Z", undefined), true);
});

test("pending review state is retained for safe refresh recovery", () => {
  const restored = decodeWorkspaceState(encodeWorkspaceState(state)) as typeof state;
  assert.equal(restored.pendingReview?.indexReview?.candidateId, "idx-1");
  assert.equal(restored.pendingReview?.indexReview?.choices["Plans|identity:one"], false);
  assert.deepEqual(restored.sheetsCache?.tabs, [{ name: "Policies", rows: [] }]);
  assert.equal(restored.licensingFallback?.authoritative, false);
});

test("browser recovery exposes outage and unauthorized fallback states", () => {
  const cloud = readFileSync(resolve(process.cwd(), "artifacts/stop-loss-app/public/cloud-sync.js"), "utf8");
  assert.match(cloud, /Session required/);
  assert.match(cloud, /Browser fallback/);
  assert.match(cloud, /Drive durable/);
  assert.match(cloud, /\/drive\/workspace-state/);
});

test("workspace-state persistence does not create Drive sharing permissions", () => {
  const drive = readFileSync(resolve(process.cwd(), "artifacts/api-server/src/lib/google-drive.ts"), "utf8");
  const stateHelpers = drive.slice(drive.indexOf("MANAGED_WORKSPACE_STATE_NAME"), drive.indexOf("const DRIVE_FOLDER_MIME"));
  assert.doesNotMatch(stateHelpers, /permissions|shareFile/);
});

test("review cancellation and approval clear pending state before the next durable save", () => {
  const indexRuntime = readFileSync(resolve(process.cwd(), "artifacts/stop-loss-app/public/index-reference-runtime.js"), "utf8");
  assert.match(indexRuntime, /pendingIndexReview = null/);
  assert.match(indexRuntime, /index-review-cancelled/);
  assert.match(indexRuntime, /pendingDisableIndex = null/);
});