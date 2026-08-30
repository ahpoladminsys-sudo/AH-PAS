import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import test, { mock } from "node:test";
import express from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import driveRouter from "../src/routes/drive.ts";
import { requireAuth } from "../src/middlewares/requireAuth.ts";

process.env.SESSION_SECRET = "authenticated-index-drive-test-secret";
process.env.AUTHORIZED_USER_EMAILS = "operator@example.com";

const workspaceRoot = resolve(new URL("../../..", import.meta.url).pathname);
const indexRuntimeSource = readFileSync(
  resolve(workspaceRoot, "artifacts/stop-loss-app/public/index-reference-runtime.js"),
  "utf8",
);
const cloudSyncSource = readFileSync(
  resolve(workspaceRoot, "artifacts/stop-loss-app/public/cloud-sync.js"),
  "utf8",
);

const INDEX_FILE_ID = "shared-drive-august-index";
const initialModifiedTime = "2026-08-29T12:00:00.000Z";
const savedModifiedTime = "2026-08-29T12:01:00.000Z";
const newerModifiedTime = "2026-08-29T12:02:00.000Z";
const concurrentModifiedTime = "2026-08-29T12:03:00.000Z";

const drive = {
  metadata: {
    id: INDEX_FILE_ID,
    name: "Indexes_August_2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: "1024",
    modifiedTime: initialModifiedTime,
    webViewLink: `https://drive.google.com/file/d/${INDEX_FILE_ID}/view`,
    parents: ["shared-drive-folder"],
  },
  content: Buffer.from("original-index-workbook"),
  patchCount: 0,
  advanceBeforeMetadata: false,
  concurrentConflictOnNextUpdate: false,
  requestLog: [],
  patchBodies: [],
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function portableSessionToken(userId = "user-authenticated-index-test") {
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: "authenticated-index-test",
    expiresAt: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function documentIdFromPath(pathname) {
  const match = pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

mock.method(ReplitConnectors.prototype, "proxy", async (_connection, path, options = {}) => {
  const url = new URL(`https://drive.test${path}`);
  const method = options.method ?? "GET";
  const query = url.searchParams.get("q") ?? "";
  drive.requestLog.push({ method, path });

  if (query.includes("mimeType !=")) {
    return jsonResponse({ files: [{ ...drive.metadata }] });
  }

  if (method === "PATCH" && url.pathname === `/upload/drive/v3/files/${INDEX_FILE_ID}`) {
    drive.patchCount += 1;
    drive.patchBodies.push(Buffer.from(options.body));
    drive.content = Buffer.from(options.body);
    drive.metadata.modifiedTime = savedModifiedTime;
    drive.metadata.size = String(drive.content.length);
    return jsonResponse({ ...drive.metadata });
  }

  const documentId = documentIdFromPath(url.pathname);
  if (documentId !== INDEX_FILE_ID) {
    throw new Error(`Unexpected mocked Drive path: ${method} ${path}`);
  }

  if (method === "GET") {
    if (url.searchParams.get("alt") === "media") {
      return new Response(drive.content, {
        status: 200,
        headers: { "content-type": drive.metadata.mimeType },
      });
    }
    if (drive.advanceBeforeMetadata || drive.concurrentConflictOnNextUpdate) {
      const isConcurrentUpdate = drive.concurrentConflictOnNextUpdate;
      drive.advanceBeforeMetadata = false;
      drive.concurrentConflictOnNextUpdate = false;
      drive.metadata.modifiedTime = isConcurrentUpdate ? concurrentModifiedTime : newerModifiedTime;
      drive.content = Buffer.from(JSON.stringify({
        sourceFile: drive.metadata.name,
        tabs: [
          { name: "Branch", rows: [{ State: "PA", Region: "Concurrent remote region" }] },
        ],
      }));
    }
    return jsonResponse({ ...drive.metadata });
  }

  throw new Error(`Unexpected mocked Drive request: ${method} ${path}`);
});

function createProtectedApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(requireAuth, driveRouter);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ error: error.message || "Unexpected test error" });
  });
  return app;
}

class BrowserElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.disabled = false;
    this.textContent = "";
    this._innerHTML = "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.children = [];
    const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = buttonPattern.exec(this._innerHTML))) {
      const button = new BrowserElement(this.ownerDocument, "button");
      const attributes = match[1];
      const attributePattern = /([:\w-]+)(?:="([^"]*)")?/g;
      let attribute;
      while ((attribute = attributePattern.exec(attributes))) {
        button.setAttribute(attribute[1], attribute[2] ?? "");
      }
      button.textContent = match[2].replace(/<[^>]+>/g, "");
      this.appendChild(button);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === "id") this.ownerDocument.elements.set(String(value), this);
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    if (this.id && this.ownerDocument.elements.get(this.id) === this) {
      this.ownerDocument.elements.delete(this.id);
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      const dataAttribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
      const isMatch = selector === "button"
        ? node.tagName === "BUTTON"
        : selector.startsWith("#")
          ? node.id === selector.slice(1)
          : dataAttribute
            ? node.getAttribute(dataAttribute) !== null
            : false;
      if (isMatch) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

class BrowserDocument {
  constructor() {
    this.readyState = "loading";
    this.elements = new Map();
    this.body = new BrowserElement(this, "body");
  }

  createElement(tagName) {
    return new BrowserElement(this, tagName);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  addEventListener() {}
}

class BrowserFile {
  constructor(parts, name, options = {}) {
    this.name = name;
    this.type = options.type || "";
    this.bytes = Buffer.concat(parts.map((part) => Buffer.from(part)));
  }
}

class BrowserFileReader {
  readAsText(file) {
    this.result = file.bytes.toString("utf8");
    queueMicrotask(() => this.onload?.());
  }

  readAsArrayBuffer(file) {
    const bytes = file.bytes;
    this.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    queueMicrotask(() => this.onload?.());
  }
}

const server = createProtectedApp().listen(0);
const serverAddress = server.address();
const baseUrl = `http://127.0.0.1:${serverAddress.port}`;
const sessionToken = portableSessionToken();

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-portable-session": sessionToken,
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function createBrowserRuntime() {
  const localStorageValues = new Map();
  const sessionStorageValues = new Map();
  const notices = [];
  const apiRequests = [];
  const workbookWrites = [];
  const listeners = new Map();
  const document = new BrowserDocument();
  const browserWindow = {
    STOP_LOSS_IS_FILE: true,
    STOP_LOSS_API_ORIGIN: "",
    TINUBU_INDEX_DATA: {
      sourceFile: "Indexes_August_2026.xlsx",
      sourceModifiedAt: initialModifiedTime,
      driveFileId: INDEX_FILE_ID,
      tabs: [
        { name: "Broker", rows: [] },
        { name: "Brokerages", rows: [] },
        { name: "Agents", rows: [] },
        { name: "Relationships", rows: [] },
      ],
    },
    CRMX: {
      relationships: [{
        id: "REL-1",
        name: "Example TPA",
        type: "TPA",
        status: "Active",
        state: "PA",
      }],
    },
    LicensingSuite: {
      snapshot() {
        return {
          brokerages: [{
            id: "BRK-1",
            sourceId: "BRK-1",
            name: "Updated Brokerage",
            brokerNumber: "BROKER-1",
            status: "Active",
            states: ["PA"],
          }],
          agents: [{
            id: "AGT-1",
            sourceId: "AGT-1",
            name: "Updated Agent",
            licenseNumber: "LIC-1",
            status: "Active",
            states: ["PA"],
            email: "agent@example.com",
          }],
        };
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent() {},
    setInterval() {},
    clearInterval() {},
    stopLossApiFetch(path, options = {}) {
      apiRequests.push({
        path,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      const headers = { ...(options.headers || {}) };
      if (!headers["content-type"] && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      return fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "x-portable-session": sessionToken,
          ...headers,
        },
      });
    },
    showTinubuNotice(message, isError) {
      notices.push({ message, isError: !!isError });
    },
    XLSX: {
      utils: {
        book_new() {
          return { sheets: [] };
        },
        json_to_sheet(rows) {
          return rows;
        },
        aoa_to_sheet(rows) {
          return rows;
        },
        sheet_to_json(sheet) {
          return sheet;
        },
        book_append_sheet(workbook, sheet, name) {
          workbook.sheets.push({ name, sheet });
        },
      },
      read(value) {
        const workbook = JSON.parse(Buffer.from(new Uint8Array(value)).toString("utf8"));
        return {
          SheetNames: workbook.tabs.map((tab) => tab.name),
          Sheets: Object.fromEntries(workbook.tabs.map((tab) => [tab.name, tab.rows])),
        };
      },
      write(workbook) {
        workbookWrites.push(workbook);
        return Buffer.from(JSON.stringify(workbook)).toString("base64");
      },
    },
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
  };
  const context = {
    console,
    document,
    window: browserWindow,
    CRMX: browserWindow.CRMX,
    TINUBU: {},
    localStorage: browserWindow.localStorage,
    sessionStorage: browserWindow.sessionStorage,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout,
    clearTimeout,
    fetch,
    File: BrowserFile,
    FileReader: BrowserFileReader,
    atob,
    Blob,
    URL,
    Uint8Array,
    Buffer,
  };

  vm.runInNewContext(cloudSyncSource, context, { filename: "cloud-sync.js" });
  vm.runInNewContext(indexRuntimeSource, context, { filename: "index-reference-runtime.js" });
  return { browserWindow, document, notices, apiRequests, workbookWrites };
}

function resetDrive(content = Buffer.from("original-index-workbook")) {
  drive.metadata.modifiedTime = initialModifiedTime;
  drive.metadata.size = String(content.length);
  drive.content = content;
  drive.patchCount = 0;
  drive.advanceBeforeMetadata = false;
  drive.concurrentConflictOnNextUpdate = false;
  drive.requestLog = [];
  drive.patchBodies = [];
}

function remoteWorkbook(region) {
  return Buffer.from(JSON.stringify({
    sourceFile: drive.metadata.name,
    tabs: [
      { name: "Branch", rows: [{ State: "PA", Region: region }] },
    ],
  }));
}

async function waitFor(condition, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

test.after(() => server.close());

test("unauthenticated index discovery is rejected by the protected route", async () => {
  const response = await fetch(`${baseUrl}/drive/index-workbooks`);
  assert.equal(response.status, 401);
});

test("authenticated browser discovery and licensing save update the Shared Drive workbook", async () => {
  resetDrive();

  const discovered = await request("/drive/index-workbooks");
  assert.equal(discovered.status, 200);
  assert.deepEqual(discovered.body.files.map((file) => ({
    id: file.id,
    name: file.name,
    modifiedTime: file.modifiedTime,
    parentIds: file.parentIds,
  })), [{
    id: INDEX_FILE_ID,
    name: "Indexes_August_2026.xlsx",
    modifiedTime: initialModifiedTime,
    parentIds: ["shared-drive-folder"],
  }]);

  const browser = createBrowserRuntime();
  const saved = await browser.browserWindow.TinubuIndex.persistDirectoryChanges();
  assert.equal(saved.id, INDEX_FILE_ID);
  assert.equal(saved.modifiedTime, savedModifiedTime);
  assert.equal(drive.patchCount, 1);
  assert.notDeepEqual(drive.content, Buffer.from("original-index-workbook"));

  const writtenTabs = browser.workbookWrites.at(-1).sheets;
  const brokerages = writtenTabs.find((sheet) => sheet.name === "Brokerages").sheet;
  const agents = writtenTabs.find((sheet) => sheet.name === "Agents").sheet;
  const relationships = writtenTabs.find((sheet) => sheet.name === "Relationships").sheet;
  assert.equal(brokerages[0]["Brokerage/Agency Name"], "Updated Brokerage");
  assert.equal(agents[0].Name, "Updated Agent");
  assert.equal(relationships[0].Name, "Example TPA");
});

test("a newer Shared Drive modifiedTime is visible in the browser and cannot be overwritten", async () => {
  resetDrive();
  const browser = createBrowserRuntime();
  const patchCountBeforeConflict = drive.patchCount;
  drive.advanceBeforeMetadata = true;

  const result = await browser.browserWindow.TinubuIndex.persistDirectoryChanges();
  assert.equal(result, null);
  assert.equal(drive.patchCount, patchCountBeforeConflict);
  assert.notDeepEqual(drive.content, Buffer.from("original-index-workbook"));
  assert.ok(browser.notices.some((notice) =>
    notice.isError && /changed after it was loaded.*Refresh the index/i.test(notice.message),
  ));
});

test("browser conflict recovery reads before retry, preserves local directory edits, and blocks a concurrent overwrite", async () => {
  resetDrive();
  const browser = createBrowserRuntime();
  drive.advanceBeforeMetadata = true;

  const conflict = await browser.browserWindow.TinubuIndex.persistDirectoryChanges();
  assert.equal(conflict, null);
  assert.equal(drive.patchCount, 0);
  const initialDialog = browser.document.getElementById("sl-index-conflict-recovery");
  assert.ok(initialDialog, "a conflict should render the recovery dialog");
  const loadButton = initialDialog.querySelector("[data-index-conflict-load]");
  assert.ok(loadButton, "the first recovery action should explicitly load and review");

  const requestsBeforeRefresh = browser.apiRequests.length;
  drive.content = remoteWorkbook("Remote region from refreshed workbook");
  await loadButton.onclick();
  assert.ok(
    browser.document.querySelector("[data-index-conflict-retry]"),
    `the explicit load action should finish before exposing retry; notices=${JSON.stringify(browser.notices)}; api=${JSON.stringify(browser.apiRequests)}`,
  );
  const refreshRequests = browser.apiRequests.slice(requestsBeforeRefresh);
  const refreshReadIndex = refreshRequests.findIndex((request) =>
    request.method === "GET" && request.path === `/drive/documents/${INDEX_FILE_ID}/content`,
  );
  assert.ok(refreshReadIndex >= 0, "recovery should read the newer workbook");
  assert.equal(
    refreshRequests.some((request) => request.method === "PUT"),
    false,
    "loading the newer workbook must not retry automatically",
  );
  assert.equal(
    browser.browserWindow.LicensingSuite.snapshot().brokerages[0].name,
    "Updated Brokerage",
  );
  assert.equal(
    browser.browserWindow.LicensingSuite.snapshot().agents[0].name,
    "Updated Agent",
  );
  assert.equal(browser.browserWindow.CRMX.relationships[0].name, "Example TPA");

  const retryButton = browser.document.querySelector("[data-index-conflict-retry]");
  await retryButton.onclick();
  assert.equal(drive.patchCount, 1, "the explicit retry should update Drive");
  assert.equal(
    browser.document.getElementById("sl-index-conflict-recovery"),
    null,
    "successful recovery should close the dialog",
  );
  const retryRequest = browser.apiRequests
    .filter((request) => request.method === "PUT" && request.path === `/drive/documents/${INDEX_FILE_ID}/content`)
    .at(-1);
  assert.equal(
    retryRequest.body.expectedModifiedTime,
    newerModifiedTime,
    "retry should use the refreshed Drive modifiedTime",
  );
  const retryRequestIndex = browser.apiRequests.indexOf(retryRequest);
  const contentReadRequestIndex = browser.apiRequests.findIndex((request, index) =>
    index >= requestsBeforeRefresh &&
    request.method === "GET" &&
    request.path === `/drive/documents/${INDEX_FILE_ID}/content`,
  );
  assert.ok(contentReadRequestIndex < retryRequestIndex, "the newer workbook must be read before retry");

  const writtenWorkbook = JSON.parse(drive.patchBodies.at(-1).toString("utf8"));
  const writtenSheet = (name) => writtenWorkbook.sheets.find((sheet) => sheet.name === name).sheet;
  assert.equal(writtenSheet("Brokerages")[0]["Brokerage/Agency Name"], "Updated Brokerage");
  assert.equal(writtenSheet("Agents")[0].Name, "Updated Agent");
  assert.equal(writtenSheet("Relationships")[0].Name, "Example TPA");
  assert.equal(writtenSheet("Branch")[0].Region, "Remote region from refreshed workbook");

  drive.advanceBeforeMetadata = true;
  const secondConflict = await browser.browserWindow.TinubuIndex.persistDirectoryChanges();
  assert.equal(secondConflict, null);
  assert.equal(drive.patchCount, 1);
  const secondRecoveryLoad = browser.document
    .getElementById("sl-index-conflict-recovery")
    .querySelector("[data-index-conflict-load]");
  assert.ok(secondRecoveryLoad, "a second conflict should require another explicit refresh");
  await secondRecoveryLoad.onclick();
  assert.ok(browser.document.querySelector("[data-index-conflict-retry]"));

  drive.concurrentConflictOnNextUpdate = true;
  await browser.document.querySelector("[data-index-conflict-retry]").onclick();
  assert.equal(drive.patchCount, 1, "a concurrent 409 must not report or apply an overwrite");
  assert.ok(
    browser.notices.some((notice) =>
      notice.isError && /changed again.*No overwrite was applied/i.test(notice.message),
    ),
    `a concurrent conflict should report no overwrite: ${JSON.stringify(browser.notices)}`,
  );
  const requestsAfterSecondConflict = browser.apiRequests.length;
  assert.equal(
    await browser.browserWindow.TinubuIndex.persistDirectoryChanges(),
    null,
    "directory recovery remains blocked after a concurrent 409",
  );
  assert.equal(browser.apiRequests.length, requestsAfterSecondConflict);
  const secondDialog = browser.document.getElementById("sl-index-conflict-recovery");
  assert.ok(secondDialog.querySelector("[data-index-conflict-load]"), "another refresh is required before retry");
  await secondDialog.querySelector("[data-index-conflict-load]").onclick();
  assert.ok(
    browser.document.querySelector("[data-index-conflict-retry]"),
    "the blocked recovery should expose retry only after another explicit refresh",
  );
});