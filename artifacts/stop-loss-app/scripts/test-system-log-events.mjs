import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(scriptDirectory, '..', 'public', 'index-reference-runtime.js');
const runtime = fs.readFileSync(runtimePath, 'utf8');

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.parentElement = null;
    this.className = '';
    this.textContent = '';
    this.isConnected = false;
    this.classList = { contains: () => false, toggle() {}, add() {}, remove() {} };
  }

  set id(value) {
    this.attributes.id = value;
    this.ownerDocument.elements.set(value, this);
  }

  get id() {
    return this.attributes.id || '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
    const selectors = [
      ['tr', 'data-system-event-row'],
      ['button', 'data-system-event-view'],
      ['button', 'data-system-event-close'],
      ['button', 'data-system-event-retry'],
      ['div', 'data-system-event-ai'],
    ];
    for (const [tagName, attribute] of selectors) {
      const pattern = new RegExp(`<${tagName}\\b[^>]*${attribute}="([^"]*)"[^>]*>`, 'gi');
      let match;
      while ((match = pattern.exec(this._innerHTML))) {
        const child = new FakeElement(this.ownerDocument, tagName);
        child.setAttribute(attribute, match[1]);
        this.appendChild(child);
      }
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = value;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  appendChild(child) {
    child.parentElement = this;
    child.setConnected(this.isConnected);
    this.children.push(child);
    return child;
  }

  setConnected(value) {
    this.isConnected = value;
    this.children.forEach((child) => child.setConnected(value));
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
    if (this.id) this.ownerDocument.elements.delete(this.id);
    this.parentElement = null;
    this.setConnected(false);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  insertBefore(child) {
    return this.appendChild(child);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const attributeMatch = selector.match(/^\[([^\]]+)\]$/);
    const visit = (node) => {
      if (attributeMatch && node.getAttribute(attributeMatch[1]) !== null) matches.push(node);
      if (selector.startsWith('button,') && node.tagName === 'BUTTON') matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.readyState = 'complete';
    this.elements = new Map();
    this.activeElement = null;
    this.body = new FakeElement(this, 'body');
    this.body.setConnected(true);
    this.documentElement = this.body;
    this.appContainer = new FakeElement(this, 'main');
    this.appContainer.className = 'app-container';
    this.body.appendChild(this.appContainer);
    const trigger = new FakeElement(this, 'button');
    trigger.id = 'system-log-trigger';
    this.appContainer.appendChild(trigger);
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    if (selector === '.app-container') return this.appContainer;
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  contains(element) {
    return Boolean(element && element.isConnected);
  }

  addEventListener() {}
}

function createStorage(state) {
  const values = new Map([['tinubu-system-log-v1', JSON.stringify(state)]]);
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createContext() {
  const events = [
    {
      id: 'SYS-failed',
      timestamp: '2026-08-30T12:00:00.000Z',
      category: 'Cloud',
      action: 'CLOUD_SYNC_FAILED',
      status: 'Failed',
      detail: `Authorization: Bearer ${'s'.repeat(30)} ${'x'.repeat(2100)}`,
      actor: 'token=actor-secret-value',
      operationId: 'secret=top-level-operation-secret',
      metadata: {
        source: 'System Log push',
        service: 'drive',
        code: 'PROVIDER_ERROR',
        token: 'must-not-leave-browser',
        responsePayload: 'must-not-be-visible',
      },
    },
    {
      id: 'SYS-success',
      timestamp: '2026-08-30T11:00:00.000Z',
      category: 'Index',
      action: 'INDEX_IMPORTED',
      status: 'Completed',
      detail: 'Index imported.',
      actor: 'Build-time import',
      metadata: {},
    },
    {
      category: 'System',
      detail: '',
      metadata: null,
    },
  ];
  const document = new FakeDocument();
  const storage = createStorage({
    activeId: 'index-1',
    indexFiles: [{
      id: 'index-1',
      name: 'Fixture index',
      status: 'Active',
      uploadedAt: '2026-08-30T10:00:00.000Z',
      uploadedHow: 'Fixture',
      totalRecords: 0,
      tabCount: 0,
      tabSummary: [],
      data: { tabs: [] },
    }],
    events,
  });
  const requests = [];
  const browserWindow = {
    TINUBU_INDEX_DATA: { sourceFile: 'fixture.xlsx', tabs: [] },
    addEventListener() {},
    dispatchEvent() {},
    setInterval() {},
    clearInterval() {},
    stopLossApiFetch(pathname, options) {
      requests.push({ pathname, body: JSON.parse(options.body) });
      return Promise.resolve(new Response(JSON.stringify({
        recordedEvidence: ['The event status is Failed.'],
        likelyCauses: ['A provider issue may have caused the failure.'],
        repairActions: ['Review the provider status.'],
        verificationSteps: ['Confirm a later successful event.'],
        advisory: 'Advisory only: no repair or other action was performed by this summary.',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    },
  };
  const context = {
    console,
    document,
    localStorage: storage,
    window: browserWindow,
    Response,
    Promise,
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  Object.assign(browserWindow, {
    document,
    localStorage: storage,
    Event: context.Event,
    CustomEvent: context.CustomEvent,
    setTimeout: context.setTimeout,
    clearTimeout: context.clearTimeout,
  });
  vm.runInNewContext(runtime, context, { filename: runtimePath });
  return { context, document, requests };
}

const { context, document, requests } = createContext();
context.window.TinubuSystemLog.open();
const view = document.getElementById('view-system-log');
assert.match(view.innerHTML, /GitHub &amp; application access/);
assert.match(view.innerHTML, /ahpoladminsys-sudo\/AH-PAS/);
assert.match(view.innerHTML, /<th>Action<\/th>/);
assert.match(view.innerHTML, /data-system-event-view="SYS-failed"/);
assert.match(view.innerHTML, /tabindex="0"/);

const rows = view.querySelectorAll('[data-system-event-row]');
const buttons = view.querySelectorAll('[data-system-event-view]');
assert.equal(rows.length, 3);
assert.equal(buttons.length, 3);

const failedRow = rows.find((row) => row.getAttribute('data-system-event-row') === 'SYS-failed');
failedRow.ondblclick();
await Promise.resolve();
await Promise.resolve();
assert.equal(requests.length, 1, 'double-clicking a failed event requests advisory guidance');
assert.equal(requests[0].pathname, '/gemini/repair-summary');
assert.equal(requests[0].body.event.detail.length, 2000, 'AI detail input is bounded');
assert.match(requests[0].body.event.detail, /\[redacted\]/);
assert.doesNotMatch(requests[0].body.event.detail, /s{20,}/);
assert.equal(requests[0].body.event.metadata.token, undefined);
assert.equal(requests[0].body.event.metadata.responsePayload, undefined);
assert.doesNotMatch(requests[0].body.event.actorSource, /actor-secret-value/);
assert.doesNotMatch(requests[0].body.event.operationId, /top-level-operation-secret/);

let modal = document.getElementById('system-event-detail-modal');
assert.ok(modal, 'double-click opens the event detail modal');
assert.match(modal.innerHTML, /Full activity detail/);
assert.match(modal.innerHTML, /Operation identifier/);
assert.doesNotMatch(modal.innerHTML, /must-not-leave-browser|must-not-be-visible|top-level-operation-secret|actor-secret-value/);
const modalButtons = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
modalButtons.at(-1).focus();
let tabPrevented = false;
modal.onkeydown({ key: 'Tab', shiftKey: false, preventDefault() { tabPrevented = true; } });
assert.equal(tabPrevented, true);
assert.equal(document.activeElement, modalButtons[0], 'Tab wraps from the last control to the first');
modalButtons[0].focus();
let shiftTabPrevented = false;
modal.onkeydown({ key: 'Tab', shiftKey: true, preventDefault() { shiftTabPrevented = true; } });
assert.equal(shiftTabPrevented, true);
assert.equal(document.activeElement, modalButtons.at(-1), 'Shift+Tab wraps from the first control to the last');
modal.onkeydown({ key: 'Escape', preventDefault() {} });
assert.equal(document.getElementById('system-event-detail-modal'), null);
assert.equal(document.activeElement, failedRow, 'closing restores focus to the opening row');

const successButton = buttons.find((button) => button.getAttribute('data-system-event-view') === 'SYS-success');
successButton.onclick({ stopPropagation() {} });
await Promise.resolve();
assert.equal(requests.length, 1, 'successful events never request AI guidance');
context.window.TinubuSystemLog.closeEvent();

const legacyRow = rows.find((row) => row.getAttribute('data-system-event-row').startsWith('legacy-'));
legacyRow.onkeydown({ key: 'Enter', preventDefault() {} });
modal = document.getElementById('system-event-detail-modal');
assert.match(modal.innerHTML, /SYSTEM_EVENT/);
assert.match(modal.innerHTML, /No activity detail was recorded/);
assert.equal(requests.length, 1, 'legacy routine events remain viewable without an AI request');

context.window.TinubuSystemLog.recordCloudEvent('APPLICATION_ACCESS_CHECKED', 'Completed', 'GitHub application access verified.', {
  provider: 'github',
  authorization: 'authorized',
  repository: 'ahpoladminsys-sudo/AH-PAS',
  token: 'must-never-be-persisted',
  responsePayload: 'must-never-be-persisted',
  dedupeKey: 'application-access|connected|github|authorized',
  dedupeWindowMs: 300000,
});
context.window.TinubuSystemLog.recordCloudEvent('APPLICATION_ACCESS_CHECKED', 'Completed', 'GitHub application access verified.', {
  provider: 'github',
  authorization: 'authorized',
  repository: 'ahpoladminsys-sudo/AH-PAS',
  token: 'another-secret',
  dedupeKey: 'application-access|connected|github|authorized',
  dedupeWindowMs: 300000,
});
const applicationEvents = context.window.TinubuSystemLog.snapshot().events.filter((event) => event.action === 'APPLICATION_ACCESS_CHECKED');
assert.equal(applicationEvents.length, 1, 'repeated GitHub application-access observations are deduplicated');
assert.equal(applicationEvents[0].metadata.provider, 'github');
assert.equal(applicationEvents[0].metadata.token, undefined);
assert.equal(applicationEvents[0].metadata.responsePayload, undefined);

console.log('System Log event fixture passed: row actions, accessibility, legacy details, failure-only AI, bounded input, and redaction are intact.');