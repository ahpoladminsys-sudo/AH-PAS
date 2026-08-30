import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(scriptDirectory, 'fixtures', 'index-replacement-duplicates.json');
const runtimePath = path.join(scriptDirectory, '..', 'public', 'index-reference-runtime.js');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
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
    this.innerText = '';
    this.textContent = '';
    this.checked = false;
    this.onchange = null;
    this.classList = { contains: () => false };
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

    // The test only needs the controls rendered by the review card. Parsing
    // these into real element objects keeps the onchange path identical to
    // what a browser page exercises.
    const inputPattern = /<input\b([^>]*data-index-likely-choice="([^"]+)"[^>]*)>/gi;
    let match;
    while ((match = inputPattern.exec(this._innerHTML))) {
      const input = new FakeElement(this.ownerDocument, 'input');
      input.setAttribute('data-index-likely-choice', match[2]);
      input.checked = /\schecked(?:\s|>|$)/i.test(match[1]);
      this.appendChild(input);
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
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
    return child;
  }

  insertAdjacentElement(_position, child) {
    return this.appendChild(child);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (selector === '[data-index-likely-choice]' && node.getAttribute('data-index-likely-choice')) {
        matches.push(node);
      } else if (selector === '.card' && node.className === 'card') {
        matches.push(node);
      } else if (selector === 'button' && node.tagName === 'BUTTON') {
        matches.push(node);
      }
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
    this.appContainer = new FakeElement(this, 'main');
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
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return this.appContainer.querySelectorAll(selector);
  }

  addEventListener() {}
}

function createBrowserContext(storage, initialData = fixture.current) {
  const document = new FakeDocument();
  const listeners = new Map();
  const browserWindow = {
    TINUBU_INDEX_DATA: initialData,
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
    },
    setInterval() {},
    clearInterval() {}
  };
  const context = {
    console,
    document,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    localStorage: storage,
    window: browserWindow
  };
  context.window.document = document;
  context.window.Event = context.Event;
  context.window.CustomEvent = context.CustomEvent;
  context.window.setTimeout = context.setTimeout;
  context.window.clearTimeout = context.clearTimeout;
  context.window.localStorage = storage;
  vm.runInNewContext(runtime, context, { filename: runtimePath });
  return context;
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function indexFile(id, name, data, status, supersedes) {
  return {
    id,
    name,
    uploadedAt: '2026-08-29T00:00:00.000Z',
    uploadedHow: 'Fixture browser test',
    sourceKind: 'Fixture',
    storageLocation: 'Browser test localStorage',
    status,
    supersedes,
    totalRecords: data.tabs.reduce((total, tab) => total + tab.rows.length, 0),
    tabCount: data.tabs.length,
    tabSummary: data.tabs.map((tab) => ({ name: tab.name, records: tab.rows.length })),
    data
  };
}

const storage = createStorage();
storage.setItem('tinubu-system-log-v1', JSON.stringify({
  activeId: 'current-index',
  indexFiles: [
    indexFile('current-index', fixture.current.sourceFile, fixture.current, 'Active', 'No — authoritative baseline'),
    indexFile('candidate-index', fixture.candidate.sourceFile, fixture.candidate, 'Pending review', fixture.current.sourceFile)
  ],
  events: [{
    id: 'SYS-INDEX-FIXTURE',
    timestamp: '2026-08-29T00:00:00.000Z',
    category: 'Index',
    action: 'INDEX_IMPORTED',
    status: 'Completed',
    detail: 'Fixture baseline loaded.',
    actor: 'Browser test',
    metadata: {}
  }]
}));

const context = createBrowserContext(storage);

const reviewApi = context.window.TinubuIndexReview;
assert.ok(reviewApi, 'the runtime should expose the index review helpers');
const baselineData = JSON.parse(JSON.stringify(context.window.TINUBU_INDEX_DATA));
const baselineSourceFile = context.window.TinubuIndex.sourceFile;

const comparison = reviewApi.compare(fixture.current, fixture.candidate);
assert.deepEqual(JSON.parse(JSON.stringify(comparison.stats)), {
  exact: 2,
  likely: 1,
  carriedForward: 3,
  added: 4,
  internalDuplicates: 3,
  finalRecords: 10
});
assert.equal(comparison.likely.length, 1);
assert.equal(comparison.likely[0].key, 'identity:policyholder|id:phlikely');

for (const tab of comparison.mergedData.tabs) {
  const identities = tab.rows.map((row) => row.ID);
  assert.equal(new Set(identities).size, identities.length, `${tab.name} has one row per identity`);
}
assert.equal(comparison.mergedData.tabs.find((tab) => tab.name === 'Policyholder').rows.length, 6);
assert.equal(comparison.mergedData.tabs.find((tab) => tab.name === 'Branch').rows.length, 4);

// Comparing and applying a pending review must not activate or mutate the
// source used by live lookups.
const reviewed = reviewApi.apply(comparison);
assert.equal(reviewed.mergedData.sourceFile, fixture.candidate.sourceFile);
assert.equal(
  reviewed.mergedData.tabs.find((tab) => tab.name === 'Policyholder').rows.find((row) => row.ID === 'PH-LIKELY').State,
  'GA'
);
assert.deepEqual(context.window.TINUBU_INDEX_DATA, baselineData);
assert.equal(context.window.TinubuIndex.sourceFile, baselineSourceFile);

// An explicit retain decision still keeps one row, using the current value.
const retained = reviewApi.apply(comparison, { 'Policyholder|identity:policyholder|id:phlikely': false });
assert.equal(
  retained.mergedData.tabs.find((tab) => tab.name === 'Policyholder').rows.find((row) => row.ID === 'PH-LIKELY').State,
  'FL'
);
assert.deepEqual(context.window.TINUBU_INDEX_DATA, baselineData);

// The live lookup changes only when the caller performs the approval-side
// refresh that the System Log workflow invokes.
context.window.TinubuIndex.refresh(reviewed.mergedData);
assert.equal(context.window.TinubuIndex.sourceFile, fixture.candidate.sourceFile);
assert.equal(context.window.TinubuIndex.policyholders.length, 6);
assert.equal(context.window.TinubuIndex.policyholders.find((row) => row.ID === 'PH-LIKELY').State, 'GA');

// Canonical lookup regression: all normalized collections retain deterministic
// source IDs, and routing reports multiple/no-match outcomes instead of hiding
// them behind an arbitrary first match.
const canonicalData = {
  sourceFile: 'Indexes_8-2026-canonical.xlsx',
  sourceId: 'sha256:canonical-fixture',
  canonicalMetadata: { sourcePolicy: 'verified-August-2026-preferred; no v10 mixing' },
  unavailableLookups: [{ name: 'Association', available: false, reason: 'Fixture omitted the tab' }],
  tabs: [
    { name: 'Branch', rows: [
      { ID: '01', Region: 'Mid-Atlantic Region', 'U.S. State': 'Pennsylvania', Branch: 'Pittsburgh' },
      { ID: '02', Region: 'Mid-Atlantic Region', 'U.S. State': 'Pennsylvania', Branch: 'Philadelphia' },
    ] },
    { name: 'Sales reps', rows: [
      { ID: '11', 'Sales rep name': 'Rep One', Region: 'Mid-Atlantic Region', 'State Coverage': 'Pennsylvania' },
      { ID: '12', 'Sales rep name': 'Rep Two', Region: 'Mid-Atlantic Region', 'State Coverage': 'Pennsylvania' },
    ] },
    { name: 'Policyholder', rows: [{ ID: 'PH-1', Name: 'Canonical Employer', State: 'PA' }] },
  ],
};
const canonicalContext = createBrowserContext(createStorage(), canonicalData);
assert.equal(canonicalContext.window.TinubuIndex.sourceId, canonicalData.sourceId);
assert.equal(canonicalContext.window.TinubuIndex.canonical.collections.branches[0].sourceId, 'BRANCH-01');
assert.deepEqual(
  canonicalContext.window.TinubuIndex.routingFor('PA').branch.status,
  'multiple',
);
assert.deepEqual(
  canonicalContext.window.TinubuIndex.routingFor('ZZ').state.status,
  'unavailable',
);
assert.equal(canonicalContext.window.TinubuIndex.unavailableLookups[0].name, 'Association');

// Large replacement reviews must not truncate likely row decisions.
const manyCurrent = { sourceFile: 'many-current.xlsx', tabs: [{
  name: 'Policyholder',
  rows: Array.from({ length: 45 }, (_, index) => ({ ID: `PH-${index + 1}`, Name: `Employer ${index + 1}`, State: 'PA' })),
}] };
const manyCandidate = { sourceFile: 'many-candidate.xlsx', tabs: [{
  name: 'Policyholder',
  rows: Array.from({ length: 45 }, (_, index) => ({ ID: `PH-${index + 1}`, Name: `Employer ${index + 1}`, State: 'NJ' })),
}] };
const manyComparison = canonicalContext.window.TinubuIndexReview.compare(manyCurrent, manyCandidate);
assert.equal(manyComparison.likely.length, 45);

// Browser lifecycle regression: stage a replacement, make a row decision in
// the rendered review card, then create a fresh page against the same
// browser storage to model a reload.
context.window.TinubuSystemLog.reviewIndex('candidate-index');
const started = context.window.TinubuSystemLog.pendingReview().indexReview;
assert.equal(started.candidateId, 'candidate-index');
assert.equal(started.currentId, 'current-index');
assert.equal(started.choices['Policyholder|identity:policyholder|id:phlikely'], undefined);

const choiceKey = 'Policyholder|identity:policyholder|id:phlikely';
const choice = context.document.querySelector('[data-index-likely-choice]');
assert.ok(choice, 'the browser review card should render the likely-match checkbox');
assert.equal(choice.getAttribute('data-index-likely-choice'), choiceKey);
choice.checked = false;
choice.onchange();
assert.equal(
  context.window.TinubuSystemLog.pendingReview().indexReview.choices[choiceKey],
  false
);

const reloaded = createBrowserContext(storage);
const restored = reloaded.window.TinubuSystemLog.pendingReview().indexReview;
assert.equal(restored.candidateId, 'candidate-index');
assert.equal(restored.currentId, 'current-index');
assert.equal(restored.choices[choiceKey], false);
reloaded.window.TinubuSystemLog.open();
assert.match(
  reloaded.document.getElementById('view-system-log').innerHTML,
  /replacement-index-workbook\.xlsx/
);
assert.equal(
  reloaded.document.querySelector('[data-index-likely-choice]').checked,
  false,
  'the row decision should remain unchecked after reload'
);

const activeBeforeCancel = reloaded.window.TinubuSystemLog.snapshot().activeId;
reloaded.window.TinubuSystemLog.cancelReview();
assert.equal(reloaded.window.TinubuSystemLog.snapshot().activeId, activeBeforeCancel);
assert.equal(reloaded.window.TinubuSystemLog.pendingReview().indexReview, null);
assert.equal(storage.getItem('tinubu-index-pending-review-v1'), null);

// Start the same review again and verify activation remains gated until the
// operator approves it. The unchecked decision must be applied on approval.
reloaded.window.TinubuSystemLog.reviewIndex('candidate-index');
assert.equal(reloaded.window.TinubuSystemLog.snapshot().activeId, 'current-index');
const approvalChoice = reloaded.document.querySelector('[data-index-likely-choice]');
approvalChoice.checked = false;
approvalChoice.onchange();
assert.equal(reloaded.window.TinubuSystemLog.snapshot().activeId, 'current-index');

reloaded.window.TinubuSystemLog.approveReview();
const approvedState = reloaded.window.TinubuSystemLog.snapshot();
assert.equal(approvedState.activeId, 'candidate-index');
assert.equal(reloaded.window.TinubuSystemLog.pendingReview().indexReview, null);
assert.equal(storage.getItem('tinubu-index-pending-review-v1'), null);
assert.equal(
  approvedState.indexFiles.find((file) => file.id === 'candidate-index').status,
  'Active'
);
assert.equal(
  approvedState.indexFiles.find((file) => file.id === 'current-index').status,
  'Superseded'
);
assert.equal(reloaded.window.TinubuIndex.sourceFile, fixture.candidate.sourceFile);
assert.equal(
  reloaded.window.TinubuIndex.policyholders.find((row) => row.ID === 'PH-LIKELY').State,
  'FL'
);

console.log('Index replacement fixture passed: duplicate review, reload recovery, cancel, and approval boundaries are intact.');

// Cloud recovery regression: events recorded before an older remote snapshot
// hydrates must survive the replacement and remain available for the next
// managed-state save. A shared event ID must not be duplicated.
const hydrationStorage = createStorage();
const hydrationContext = createBrowserContext(hydrationStorage, fixture.current);
hydrationContext.window.TinubuSystemLog.recordCloudEvent(
  'CLOUD_SESSION_HANDOFF',
  'Completed',
  'Secure cloud session handoff completed.',
  { operationId: 'handoff-fixture-1' },
);
const localCloudEvent = hydrationContext.window.TinubuSystemLog.snapshot().events.find(
  (event) => event.action === 'CLOUD_SESSION_HANDOFF' && event.metadata?.operationId === 'handoff-fixture-1',
);
assert.ok(localCloudEvent, 'the local cloud handoff event should be recorded before hydration');
const remoteCloudEvent = {
  id: 'SYS-REMOTE-CLOUD',
  timestamp: '2026-08-29T00:00:01.000Z',
  category: 'Cloud',
  action: 'CLOUD_STATUS_SHEETS',
  status: 'Warning',
  detail: 'Google Sheets requires reauthorization.',
  actor: 'Browser test',
  metadata: { operationId: 'status-fixture-1' },
};
hydrationContext.window.TinubuSystemLog.hydrate({
  activeId: 'remote-index',
  indexFiles: [indexFile('remote-index', fixture.current.sourceFile, fixture.current, 'Active', 'No — authoritative baseline')],
  events: [localCloudEvent, remoteCloudEvent],
}, { indexReview: null, disableIndexId: null });
const hydratedEvents = hydrationContext.window.TinubuSystemLog.snapshot().events;
assert.equal(hydratedEvents.filter((event) => event.id === localCloudEvent.id).length, 1);
assert.equal(hydratedEvents.filter((event) => event.id === remoteCloudEvent.id).length, 1);
assert.ok(
  JSON.parse(hydrationStorage.getItem('tinubu-system-log-v1')).events.some((event) => event.id === localCloudEvent.id),
  'a local cloud event must remain in persisted state after remote hydration',
);
console.log('Cloud hydration fixture passed: local recovery events survive an older remote snapshot without duplication.');

// Cross-tab lifecycle regression: the pending-review key may arrive before
// the registry key, and a remote write must not replace a local row decision.
const crossTabStorage = createStorage();
crossTabStorage.setItem('tinubu-system-log-v1', JSON.stringify({
  activeId: 'current-index',
  indexFiles: [
    indexFile('current-index', fixture.current.sourceFile, fixture.current, 'Active', 'No — authoritative baseline')
  ],
  events: []
}));
const secondTab = createBrowserContext(crossTabStorage);
const firstState = JSON.parse(crossTabStorage.getItem('tinubu-system-log-v1'));
firstState.indexFiles.push(indexFile('candidate-index', fixture.candidate.sourceFile, fixture.candidate, 'Pending review', fixture.current.sourceFile));
crossTabStorage.setItem('tinubu-system-log-v1', JSON.stringify(firstState));
const firstTab = createBrowserContext(crossTabStorage);
secondTab.document.getElementById('view-system-log').classList = { contains: () => true };
firstTab.window.TinubuSystemLog.reviewIndex('candidate-index');
const pendingFromFirstTab = crossTabStorage.getItem('tinubu-index-pending-review-v1');
const registryFromFirstTab = crossTabStorage.getItem('tinubu-system-log-v1');

secondTab.window.dispatchEvent({
  type: 'storage',
  key: 'tinubu-index-pending-review-v1',
  newValue: pendingFromFirstTab
});
assert.equal(
  secondTab.window.TinubuSystemLog.pendingReview().indexReview,
  null,
  'a pending key arriving before its registry keeps the review staged for later reconciliation'
);
secondTab.window.dispatchEvent({
  type: 'storage',
  key: 'tinubu-system-log-v1',
  newValue: registryFromFirstTab
});
assert.equal(
  secondTab.window.TinubuSystemLog.pendingReview().indexReview.candidateId,
  'candidate-index',
  'the second tab restores the review after the registry arrives'
);
assert.equal(
  secondTab.document.getElementById('system-log-pending-indicator').hidden,
  false,
  'the second tab shows the pending-review navigation indicator'
);
const secondTabChoice = secondTab.document.querySelector('[data-index-likely-choice]');
secondTabChoice.checked = false;
secondTabChoice.onchange();
const remoteReview = JSON.parse(crossTabStorage.getItem('tinubu-index-pending-review-v1'));
remoteReview.indexReview.choices[choiceKey] = true;
secondTab.window.dispatchEvent({
  type: 'storage',
  key: 'tinubu-index-pending-review-v1',
  newValue: JSON.stringify(remoteReview)
});
assert.equal(
  secondTab.window.TinubuSystemLog.pendingReview().indexReview.choices[choiceKey],
  false,
  'a remote review update does not overwrite the local row decision'
);

console.log('Cross-tab review fixture passed: alert synchronization and local decision preservation are intact.');