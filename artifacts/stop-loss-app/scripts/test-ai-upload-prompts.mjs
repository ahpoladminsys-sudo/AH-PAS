import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const promptsPath = path.join(scriptDirectory, '..', 'public', 'ai-upload-prompts.js');
const cloudPath = path.join(scriptDirectory, '..', 'public', 'cloud-sync.js');
const promptsSource = fs.readFileSync(promptsPath, 'utf8');
const cloudSource = fs.readFileSync(cloudPath, 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); }
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

class BrowserElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.parentNode = null;
    this.parentElement = null;
    this.onclick = null;
    this.checked = false;
    this.value = '';
    this._text = '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set innerHTML(value) {
    this.children = [];
    this._text = '';
    this._innerHTML = String(value || '');
    this.parse(this._innerHTML);
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value || '');
    this._innerHTML = '';
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'checked') this.checked = true;
    if (name === 'value') this.value = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.parentElement = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  insertAdjacentElement(_position, child) {
    return this.appendChild(child);
  }

  insertAdjacentHTML(_position, html) {
    const fragment = new BrowserElement(this.ownerDocument, 'fragment');
    fragment.innerHTML = html;
    fragment.children.forEach((child) => this.appendChild(child));
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (matchesSelector(node, selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  parse(html) {
    const stack = [this];
    const tokenPattern = /<\/?([a-z0-9]+)\b([^>]*)>|([^<]+)/gi;
    let match;
    while ((match = tokenPattern.exec(html))) {
      if (match[3]) {
        stack[stack.length - 1]._text += decodeHtml(match[3]);
        continue;
      }
      if (match[0].startsWith('</')) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const element = new BrowserElement(this.ownerDocument, match[1]);
      const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let attribute;
      while ((attribute = attributePattern.exec(match[2]))) {
        element.setAttribute(
          attribute[1],
          decodeHtml(attribute[2] ?? attribute[3] ?? attribute[4] ?? '')
        );
      }
      this.appendTo(stack[stack.length - 1], element);
      const isVoid = /^(input|br|hr|img|meta|link)$/.test(element.tagName.toLowerCase());
      if (!isVoid && !/\/\s*$/.test(match[2])) stack.push(element);
    }
  }

  appendTo(parent, child) {
    parent.appendChild(child);
  }
}

function matchesSelector(element, selector) {
  const idMatch = selector.match(/^#([-\w]+)$/);
  if (idMatch) return element.id === idMatch[1];

  const classMatch = selector.match(/^\.([-\w]+)$/);
  if (classMatch) return element.className.split(/\s+/).includes(classMatch[1]);

  const attributeMatches = [...selector.matchAll(/\[([:\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g)];
  const tagName = selector.split(/[#.[\]]/, 1)[0];
  if (tagName && element.tagName.toLowerCase() !== tagName.toLowerCase()) return false;
  return attributeMatches.every(([, name, expected]) => {
    const actual = element.getAttribute(name);
    return actual !== null && (expected === undefined || actual === expected);
  });
}

class BrowserDocument {
  constructor() {
    this.body = new BrowserElement(this, 'body');
    this.documentElement = new BrowserElement(this, 'html');
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new BrowserElement(this, tagName);
  }

  getElementById(id) {
    return this.querySelector('#' + id);
  }

  querySelector(selector) {
    return this.body.querySelector(selector) || this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return [...this.body.querySelectorAll(selector), ...this.documentElement.querySelectorAll(selector)];
  }

  addEventListener(type, listener) {
    const entries = this.listeners.get(type) || [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  dispatchEvent(event) {
    (this.listeners.get(event.type) || []).forEach((listener) => listener(event));
    return true;
  }
}

function createDocument() {
  return new BrowserDocument();
}

function createContext() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const document = createDocument();
  const window = {
    localStorage,
    sessionStorage,
    document,
    TINUBU: {},
    STOP_LOSS_IS_FILE: true,
    STOP_LOSS_API_ORIGIN: '',
    confirm: () => true,
    addEventListener(type, listener) {
      document.addEventListener(type, listener);
    },
    dispatchEvent(event) {
      return document.dispatchEvent(event);
    }
  };
  const context = {
    console,
    Date,
    JSON,
    Math,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    localStorage,
    sessionStorage,
    document,
    window,
    Event: class Event {
      constructor(type) { this.type = type; }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    MutationObserver: class MutationObserver {
      observe() {}
    },
    setTimeout,
    clearTimeout
  };
  window.window = window;
  return vm.createContext(context);
}

function loadPrompts(context) {
  vm.runInContext(promptsSource, context, { filename: promptsPath });
  return context.window.AIUploadPrompts;
}

function profile(id, area, documentType, name, isDefault = false) {
  return {
    id,
    uploadArea: area,
    uploadLabel: area,
    documentType,
    name,
    active: true,
    isDefault,
    steps: [`Read ${name}.`, 'Extract explicit values only.'],
    allowedFields: ['policyholder'],
    matching: { extensions: ['.pdf'], keywords: [] }
  };
}

function assertOneDefaultPerScope(snapshot, uploadArea, documentType) {
  const scoped = Object.values(snapshot.profiles).filter(
    (item) => item.uploadArea === uploadArea && item.documentType === documentType && item.active
  );
  assert.ok(scoped.filter((item) => item.isDefault).length <= 1, `only one active default exists for ${uploadArea}/${documentType}`);
}

const context = createContext();
const prompts = loadPrompts(context);
const area = 'rfp-intake';
const otherArea = 'claims-intake';
const quoteType = 'Underwriting cover sheet';
const censusType = 'Census / enrollment roster';

const created = prompts.createProfile(profile('quote-v1', area, quoteType, 'Quote v1', true));
assert.equal(created.id, 'quote-v1');
assert.equal(prompts.snapshot().profiles['quote-v1'].isDefault, true);

const edited = prompts.updateProfile('quote-v1', {
  name: 'Quote v2',
  steps: ['Read the cover sheet.', 'Extract the named insured.']
});
assert.equal(edited.version, 2, 'editing creates a new profile version');
assert.equal(edited.name, 'Quote v2');
assert.equal(edited.versionHistory.at(-1).version, 1);

const editedAgain = prompts.updateProfile('quote-v1', {
  name: 'Quote v3',
  steps: ['Read the revised cover sheet.', 'Extract the named insured and effective date.'],
  destination: 'Quote review fields',
  destinationRules: 'Quote review fields',
  examples: 'Use the named insured exactly as shown.',
  feedbackNotes: 'Check the effective date against the source.'
});
assert.equal(editedAgain.version, 3, 'each edit advances the profile version');

const beforeComparison = prompts.snapshot();
const comparison = prompts.compareProfileVersion('quote-v1', 1);
assert.equal(comparison.current.version, 3, 'comparison includes the current profile version');
assert.equal(comparison.revision.version, 1, 'comparison includes the selected historical version');
assert.deepEqual(comparison.revision.steps, profile('quote-v1', area, quoteType, 'Quote v1', true).steps, 'comparison includes historical prompt instructions');
assert.equal(comparison.current.destinationRules, 'Quote review fields', 'comparison includes current destination rules');
assert.deepEqual(comparison.revision.allowedFields, ['policyholder'], 'comparison includes historical allowed fields');
assert.deepEqual(prompts.snapshot(), beforeComparison, 'comparison does not change the saved profile');
comparison.revision.steps.push('This local comparison copy must not mutate the profile.');
assert.equal(prompts.snapshot().profiles['quote-v1'].version, 3, 'comparison results are defensive copies');

// Browser lifecycle regression: open the catalog and editor, render a
// historical comparison, then verify that cancel preserves both unsaved
// editor input and the saved profile. A restore click must stop at the
// confirmation boundary when the operator declines it.
const uploadInput = context.document.createElement('input');
uploadInput.id = 'browser-test-upload';
uploadInput.setAttribute('aria-label', 'RFP document upload');
context.document.body.appendChild(uploadInput);
prompts.catalog(uploadInput, area);

const root = context.document.getElementById('ai-upload-prompts-root');
assert.ok(root, 'the browser prompt root should render');
const editButton = root.querySelector('[data-ai-edit="quote-v1"]');
assert.ok(editButton, 'the catalog should render an edit action for the profile');
editButton.onclick();

const editorName = root.querySelector('#ai-profile-name');
assert.ok(editorName, 'the prompt editor should render its profile name field');
editorName.value = 'Unsaved operator edit';
const savedBeforeComparison = JSON.stringify(prompts.snapshot());
const compareButton = root.querySelector('[data-ai-compare][data-ai-version="1"]');
assert.ok(compareButton, 'the editor should render a compare action for v1');
compareButton.onclick();

const comparisonOverlay = root.querySelector('.ai-profile-comparison-overlay');
assert.ok(comparisonOverlay, 'the historical revision should open in a dialog');
const comparisonText = comparisonOverlay.textContent;
assert.match(comparisonText, /Current active version/, 'the current version column should render');
assert.match(comparisonText, /v3/, 'the current version number should render');
assert.match(comparisonText, /Revision to restore/, 'the revision column should render');
assert.match(comparisonText, /v1/, 'the historical version number should render');
for (const section of [
  'Prompt instructions',
  'Destination rules',
  'Allowed destination fields',
  'Examples / expected patterns',
  'Scope'
]) {
  assert.match(comparisonText, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${section} comparison section should render`);
}
assert.equal(
  comparisonOverlay.querySelectorAll('[data-ai-comparison-state="changed"]').length,
  4,
  'changed prompt sections should be marked'
);
assert.equal(
  comparisonOverlay.querySelectorAll('[data-ai-comparison-state="unchanged"]').length,
  1,
  'unchanged prompt sections should remain unmarked'
);
assert.equal(
  comparisonOverlay.querySelectorAll('.ai-profile-comparison-change-status').length,
  4,
  'changed prompt sections should show a visible status marker'
);

const comparisonCancel = comparisonOverlay.querySelector('[data-ai-comparison-cancel]');
assert.ok(comparisonCancel, 'the comparison dialog should render a cancel action');
comparisonCancel.onclick();
assert.equal(root.querySelector('.ai-profile-comparison-overlay'), null, 'cancel should close only the comparison dialog');
assert.equal(root.querySelector('#ai-profile-name').value, 'Unsaved operator edit', 'cancel should preserve unsaved editor input');
assert.equal(JSON.stringify(prompts.snapshot()), savedBeforeComparison, 'cancel should not change the saved profile');

const compareAgain = root.querySelector('[data-ai-compare][data-ai-version="1"]');
assert.ok(compareAgain, 'the editor should remain available after comparison cancel');
compareAgain.onclick();
let confirmationMessage = '';
context.window.confirm = (message) => {
  confirmationMessage = message;
  return false;
};
const restoreButton = root.querySelector('[data-ai-comparison-restore]');
assert.ok(restoreButton, 'the comparison dialog should render a restore action');
restoreButton.onclick();
assert.match(confirmationMessage, /Restore version 1/, 'restore should require an explicit confirmation');
assert.ok(root.querySelector('.ai-profile-comparison-overlay'), 'declining confirmation should keep the comparison open');
assert.equal(JSON.stringify(prompts.snapshot()), savedBeforeComparison, 'declining restore should not change the saved profile');

const restored = prompts.restoreProfileVersion('quote-v1', 1);
assert.equal(restored.version, 4, 'restoring creates a new profile version');
assert.equal(restored.name, 'Quote v1', 'restore rehydrates the selected historical name');
assert.deepEqual(restored.steps, profile('quote-v1', area, quoteType, 'Quote v1', true).steps, 'restore rehydrates the selected historical instructions');
assert.equal(restored.versionHistory.length, 3, 'restore preserves all prior and intervening revisions');
assert.equal(restored.versionHistory.at(-1).version, 3, 'the intervening current version is retained in history');
assert.match(restored.versionHistory.at(-1).reason, /restoring v1/, 'restore records why the intervening version was preserved');
assert.ok(context.window.TINUBU.audit.some((entry) => entry.event === 'Profile restored'), 'restore is recorded in the audit trail');

const duplicate = prompts.duplicateProfile('quote-v1');
assert.notEqual(duplicate.id, 'quote-v1');
assert.equal(duplicate.version, 1, 'duplicates start a fresh version history');
assert.equal(duplicate.isDefault, false, 'duplicates do not steal the default');

const secondQuote = prompts.createProfile(profile('quote-v3', area, quoteType, 'Quote v3'));
const otherType = prompts.createProfile(profile('census-v1', area, censusType, 'Census v1', true));
const otherAreaProfile = prompts.createProfile(profile('claims-v1', otherArea, quoteType, 'Claims v1', true));

assert.equal(prompts.defaultProfile({ uploadArea: area, documentType: quoteType }).id, 'quote-v1');
assert.equal(prompts.defaultProfile({ uploadArea: area, documentType: censusType }).id, otherType.id);
assert.equal(prompts.defaultProfile({ uploadArea: otherArea, documentType: quoteType }).id, otherAreaProfile.id);
assert.equal(prompts.snapshot().profiles['claims-v1'].isDefault, true, 'a different area keeps its own default');
assert.equal(prompts.snapshot().profiles['census-v1'].isDefault, true, 'a different document type keeps its own default');
assertOneDefaultPerScope(prompts.snapshot(), area, quoteType);
assertOneDefaultPerScope(prompts.snapshot(), area, censusType);
assertOneDefaultPerScope(prompts.snapshot(), otherArea, quoteType);

prompts.setProfileActive('quote-v1', false);
assert.equal(prompts.defaultProfile({ uploadArea: area, documentType: quoteType }).id, duplicate.id, 'deactivating the default promotes another active profile');

prompts.deleteProfile(duplicate.id);
assert.equal(prompts.defaultProfile({ uploadArea: area, documentType: quoteType }).id, secondQuote.id, 'deleting the replacement promotes the next active profile');
assert.equal(prompts.snapshot().profiles['quote-v1'].isDefault, false);

const hydrationContext = createContext();
const hydrationPrompts = loadPrompts(hydrationContext);
hydrationContext.window.StopLossCloud = { queueWorkspaceStateSync() {} };
vm.runInContext(cloudSource, hydrationContext, { filename: cloudPath });
hydrationContext.window.StopLossCloud.queueWorkspaceStateSync = () => {};
const hydratedSnapshot = {
  schemaVersion: 2,
  profiles: {
    'hydrated-quote': profile('hydrated-quote', area, quoteType, 'Hydrated quote', true),
    'hydrated-census': profile('hydrated-census', area, censusType, 'Hydrated census', true)
  }
};
hydrationContext.window.stopLossApiFetch = () => Promise.resolve({
  ok: true,
  text: () => Promise.resolve(JSON.stringify({
    fileId: 'workspace-state-file',
    modifiedTime: '2026-08-29T00:00:00.000Z',
    state: {
      schemaVersion: 1,
      systemLog: { indexFiles: [], events: [] },
      pendingReview: { indexReview: null, disableIndexId: null },
      sheetsCache: { tabs: [] },
      aiPromptProfiles: hydratedSnapshot
    }
  }))
});
await hydrationContext.window.StopLossCloud.loadWorkspaceState();
for (const [id, expected] of Object.entries(hydratedSnapshot.profiles)) {
  const actual = hydrationPrompts.snapshot().profiles[id];
  assert.ok(actual, `workspace hydration restores profile ${id}`);
  assert.deepEqual(
    {
      id: actual.id,
      uploadArea: actual.uploadArea,
      documentType: actual.documentType,
      name: actual.name,
      active: actual.active,
      isDefault: actual.isDefault,
      version: actual.version,
      steps: actual.steps,
      allowedFields: actual.allowedFields,
      matching: actual.matching
    },
    {
      id: expected.id,
      uploadArea: expected.uploadArea,
      documentType: expected.documentType,
      name: expected.name,
      active: expected.active,
      isDefault: expected.isDefault,
      version: 1,
      steps: expected.steps,
      allowedFields: expected.allowedFields,
      matching: expected.matching
    },
    `workspace hydration preserves the governed fields for ${id}`
  );
  assert.match(actual.createdAt, /^\d{4}-\d{2}-\d{2}T/, 'hydration fills required profile metadata');
}

console.log('AI prompt profile regression fixture passed: CRUD, scoped defaults, safe replacement, and workspace hydration are intact.');