import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const workspaceRoot = resolve(new URL("../../..", import.meta.url).pathname);
const cloudSyncSource = readFileSync(
  resolve(workspaceRoot, "artifacts/stop-loss-app/public/cloud-sync.js"),
  "utf8",
);

const localStorageValues = new Map();
const sessionStorageValues = new Map();
const listeners = new Map();
const requests = [];
const systemEvents = [];
let googleReauthorizationRequired = true;
let applicationAccessScenario = {
  session: { status: "connected", mode: "hosted", message: "Hosted session is active." },
  identityProvider: { status: "github", message: "GitHub sign-in is verified through Clerk." },
  authorization: { status: "authorized", message: "Signed-in user is authorized." },
  repository: { repository: "ahpoladminsys-sudo/AH-PAS", status: "not_connected", message: "Authorize repository access through Replit source control." },
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function addEventListener(type, listener) {
  const current = listeners.get(type) ?? [];
  current.push(listener);
  listeners.set(type, current);
}

const browserWindow = {
  STOP_LOSS_IS_FILE: false,
  STOP_LOSS_API_ORIGIN: "https://stop-loss.test",
  open() {
    return null;
  },
  TinubuSystemLog: {
    recordCloudEvent(action, status, detail, metadata = {}) {
      const duplicate = metadata.dedupeKey && systemEvents.some((event) => event.metadata?.dedupeKey === metadata.dedupeKey);
      if (!duplicate) systemEvents.push({ action, status, detail, metadata });
    },
    updateCloudConnection(service, status, detail, metadata, eventStatus) {
      this.recordCloudEvent(`CLOUD_STATUS_${String(service).toUpperCase()}`, eventStatus, detail, metadata);
    },
  },
  addEventListener,
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    return true;
  },
};
const document = {
  visibilityState: "hidden",
  addEventListener,
  getElementById() {
    return null;
  },
};

const fetchMock = async (path, options = {}) => {
  const url = new URL(path, "https://stop-loss.test");
  const request = {
    path: url.pathname.replace(/^\/api/, ""),
    method: options.method ?? "GET",
    body: options.body ? JSON.parse(options.body) : null,
  };
  requests.push(request);

  if (request.path === "/auth/status") {
    return response({ configured: true, valid: true, status: "configured", message: "Authorized" });
  }
  if (request.path === "/auth/access-status") {
    return response({
      authorization: { configured: true, valid: true, status: "configured", source: "AUTHORIZED_USER_EMAILS", message: "Authorized" },
      application: applicationAccessScenario,
    });
  }
  if (request.path === "/auth/portable/start") {
    return response({
      authorizeUrl: "https://stop-loss.test/api/auth/portable/authorize?nonce=test-nonce",
      nonce: "test-nonce",
      expiresAt: Date.now() + 600000,
      sessionTtlSeconds: 1800,
    });
  }
  if (request.path === "/sheets/status") {
    if (googleReauthorizationRequired) {
      return response({
        error: "Google Sheets authorization has expired.",
        code: "GOOGLE_REAUTH_REQUIRED",
      }, 409);
    }
    return response({
      configured: true,
      writable: true,
      connection: "google-sheet",
      accessState: "connected",
      lastSyncedAt: null,
      spreadsheetId: "sheet-123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123/edit",
    });
  }
  if (request.path === "/drive/status") {
    return response({
      configured: true,
      connection: "google-drive",
      accessState: "connected",
      destinationEmail: null,
    });
  }
  if (request.path === "/drive/workspace-state" && request.method === "PUT") {
    return response({
      fileId: "workspace-state-1",
      modifiedTime: "2026-08-30T15:00:00.000Z",
      state: request.body.state,
    });
  }
  if (request.path === "/drive/workspace-state") {
    return response({ error: "No managed workspace state file exists." }, 404);
  }
  if (request.path === "/sheets/snapshot") {
    return response({ tabs: [], revision: "revision-1" });
  }
  if (request.path === "/drive/documents") {
    return response({ files: [] });
  }
  return response({});
};

const context = {
  console,
  document,
  window: browserWindow,
  localStorage: {
    getItem(key) {
      return localStorageValues.get(key) ?? null;
    },
    setItem(key, value) {
      localStorageValues.set(key, String(value));
    },
    removeItem(key) {
      localStorageValues.delete(key);
    },
  },
  sessionStorage: {
    getItem(key) {
      return sessionStorageValues.get(key) ?? null;
    },
    setItem(key, value) {
      sessionStorageValues.set(key, String(value));
    },
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
  fetch: fetchMock,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  Response,
  JSON,
};

vm.runInNewContext(cloudSyncSource, context, { filename: "cloud-sync.js" });

await new Promise((resolvePromise) => setImmediate(resolvePromise));
const cloud = browserWindow.StopLossCloud;
assert.ok(cloud, "the cloud runtime should initialize");

await cloud.persistWorkspaceState({ silent: true });
const queued = cloud.pendingSyncSnapshot();
assert.equal(queued.length, 1);
assert.equal(queued[0].kind, "workspace_state");
assert.equal(queued[0].status, "pending");
assert.equal("payload" in queued[0], false, "public outbox snapshots must not expose payload bytes");
assert.equal(cloud.connectionSnapshot().pendingSync.pending, 1);

googleReauthorizationRequired = false;
await cloud.refreshStatus();
for (let attempt = 0; attempt < 50 && cloud.connectionSnapshot().pendingSync.pending > 0; attempt += 1) {
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
}

assert.ok(
  requests.some((request) => request.path === "/drive/workspace-state" && request.method === "PUT"),
  "protected recovery should replay the queued workspace state",
);
assert.equal(cloud.connectionSnapshot().pendingSync.pending, 0);
assert.equal(cloud.connectionSnapshot().pendingSync.review, 0);
assert.equal(cloud.connectionSnapshot().states.github.status, "GitHub verified");
assert.equal(cloud.connectionSnapshot().states.applicationAuthorization.status, "Authorized");
assert.equal(cloud.connectionSnapshot().states.repository.status, "Not connected");
assert.ok(
  requests.some((request) => request.path === "/auth/access-status"),
  "protected refresh should include the redacted application-access contract",
);
const accessEvents = systemEvents.filter((event) => event.action === "APPLICATION_ACCESS_CHECKED");
assert.equal(accessEvents.length, 1, "repeated application status observations should be deduplicated");
assert.deepEqual(
  Object.keys(accessEvents[0].metadata).filter((key) => /token|cookie|secret|credential/i.test(key)),
  [],
  "application lifecycle events must not contain credential-shaped metadata keys",
);

applicationAccessScenario = {
  session: { status: "connected", mode: "hosted", message: "Hosted session is active." },
  identityProvider: { status: "github", message: "GitHub sign-in is verified through Clerk." },
  authorization: { status: "denied", code: "USER_NOT_AUTHORIZED", message: "This signed-in user is not authorized for the workspace." },
  repository: { repository: "ahpoladminsys-sudo/AH-PAS", status: "not_connected", message: "Repository authorization is separate." },
};
await cloud.refreshStatus();
assert.equal(cloud.connectionSnapshot().states.applicationAuthorization.status, "Denied");

applicationAccessScenario = {
  session: { status: "connected", mode: "hosted", message: "Hosted session is active." },
  identityProvider: { status: "unavailable", message: "The provider could not be verified." },
  authorization: { status: "unavailable", code: "AUTHORIZATION_PROVIDER_UNAVAILABLE", message: "Authorization could not be verified." },
  repository: { repository: "ahpoladminsys-sudo/AH-PAS", status: "unavailable", message: "Repository status is unavailable." },
};
await cloud.refreshStatus();
assert.equal(cloud.connectionSnapshot().states.github.status, "Provider unavailable");
assert.equal(cloud.connectionSnapshot().states.applicationAuthorization.status, "Authorization unavailable");

await cloud.connectHostedSession();
assert.ok(
  systemEvents.some((event) => event.action === "APPLICATION_SIGN_IN_POPUP_BLOCKED"),
  "popup blocking should produce a clear deduplicated lifecycle event",
);

browserWindow.STOP_LOSS_IS_FILE = true;
sessionStorageValues.set("tinubu-portable-session-v1", "opaque-short-lived-session");
applicationAccessScenario = {
  session: { status: "connected", mode: "portable", message: "Downloaded session is active." },
  identityProvider: { status: "github", message: "GitHub sign-in is verified through Clerk." },
  authorization: { status: "authorized", message: "Signed-in user is authorized." },
  repository: { repository: "ahpoladminsys-sudo/AH-PAS", status: "not_connected", message: "Repository authorization is separate." },
};
await cloud.refreshStatus();
assert.equal(cloud.connectionSnapshot().states.session.metadata.mode, "portable");
browserWindow.dispatchEvent(new context.CustomEvent("tinubu:portable-session-expired", { detail: { code: "PORTABLE_SESSION_EXPIRED" } }));
assert.ok(
  systemEvents.some((event) => event.action === "APPLICATION_SESSION_EXPIRED"),
  "portable session expiration should produce a clear lifecycle event",
);
assert.ok(
  cloud.pendingSyncSnapshot().some((item) => item.kind === "workspace_state" && item.status === "completed"),
  "a reconciled operation should retain a completion record without its payload",
);

console.log("cloud recovery and GitHub application-access checks passed");