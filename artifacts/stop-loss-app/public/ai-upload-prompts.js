(function () {
    'use strict';

    var STORAGE_KEY = 'tinubu-ai-upload-prompts-v2';
    var LEGACY_STORAGE_KEY = 'tinubu-ai-upload-prompts-v1';
    var ROOT_ID = 'ai-upload-prompts-root';
    var SCHEMA_VERSION = 2;
    var profiles = loadProfiles();
    var activeInput = null;
    var reviewState = null;
    var pendingChoice = null;
    var DOCUMENT_TYPES = [
        { value: 'Underwriting cover sheet', label: 'Underwriting cover sheet', hint: 'Quote cover sheet or submission summary' },
        { value: 'Procurement solicitation', label: 'RFP / procurement solicitation', hint: 'RFP, bid request, or purchasing specification' },
        { value: 'Census / enrollment roster', label: 'Census / enrollment roster', hint: 'Employee census, eligibility, or enrollment roster' },
        { value: 'Claims / loss run', label: 'Claims / loss run', hint: 'Claims listing, loss run, or large-claim report' },
        { value: 'Plan design / benefit summary', label: 'Plan design / benefit summary', hint: 'Plan document, SBC, schedule, or benefit summary' },
        { value: 'Premium / billing statement', label: 'Premium / billing statement', hint: 'Invoice, premium statement, or billing ledger' },
        { value: 'Policy / contract form', label: 'Policy / contract form', hint: 'Policy form, endorsement, binder, or contract' },
        { value: 'Unsupported / other', label: 'Unsupported / other', hint: 'No supported document type identified' }
    ];

    function now() { return new Date().toISOString(); }
    function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100000).toString(36); }
    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function cssEscape(value) {
        return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-z0-9_-]/gi, '\\$&');
    }
    function splitLines(value) {
        return String(value == null ? '' : value).split(/[\n,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
    }
    function documentTypeLabel(value) {
        var item = DOCUMENT_TYPES.filter(function (type) { return type.value === value; })[0];
        return item ? item.label : (value || 'Unsupported / other');
    }
    function inferDocumentType(area, fileName, mimeType) {
        var text = String(area || '') + ' ' + String(fileName || '') + ' ' + String(mimeType || '');
        text = text.toLowerCase();
        if (/rfp|request.?for|proposal|solicitation|bid/.test(text)) return 'Procurement solicitation';
        if (/census|enroll|eligib|member|roster|employee/.test(text)) return 'Census / enrollment roster';
        if (/loss|claim|large.?claim/.test(text)) return 'Claims / loss run';
        if (/invoice|billing|premium|statement|ledger/.test(text)) return 'Premium / billing statement';
        if (/policy|contract|binder|endorsement|form/.test(text)) return 'Policy / contract form';
        if (/plan|benefit|sbc|schedule/.test(text)) return 'Plan design / benefit summary';
        if (/cover|submission|quote|underwriting/.test(text)) return 'Underwriting cover sheet';
        return '';
    }
    function defaultArea(input) {
        if (!input) return 'rfp-intake';
        if (input.dataset && input.dataset.aiPromptArea) return input.dataset.aiPromptArea;
        var scope = input.closest && input.closest('[data-ai-upload-area], form, .card, .modal-content, section');
        var prefix = (scope && (scope.getAttribute('data-ai-upload-area') || scope.id)) || 'upload';
        return (prefix + ':' + (input.id || input.name || 'file')).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    }
    function titleFor(input, fallback) {
        if (!input) return fallback || 'RFP / PDF intake';
        var label = input.id && document.querySelector('label[for="' + cssEscape(input.id) + '"]');
        return (label && label.textContent.trim()) || input.getAttribute('aria-label') || input.name || input.id || fallback || 'Document upload';
    }
    function normalizeProfile(profile, area, fallbackType) {
        profile = profile && typeof profile === 'object' ? profile : {};
        var type = profile.documentType || fallbackType || 'Unsupported / other';
        var steps = Array.isArray(profile.steps) ? profile.steps : splitLines(profile.steps);
        if (!steps.length) steps = ['Read the uploaded document.', 'Extract only information explicitly present in the document.'];
        var history = Array.isArray(profile.versionHistory) ? profile.versionHistory : [];
        var matching = profile.matching && typeof profile.matching === 'object' ? profile.matching : {};
        var records = Array.isArray(profile.trainingRecords) ? profile.trainingRecords : [];
        return {
            schemaVersion: SCHEMA_VERSION,
            id: profile.id || uid('AIP'),
            uploadArea: profile.uploadArea || area || 'upload',
            uploadLabel: profile.uploadLabel || '',
            documentType: type,
            name: profile.name || ((profile.uploadLabel || area || 'Document') + ' · ' + documentTypeLabel(type)),
            active: profile.active !== false,
            isDefault: profile.isDefault === true || profile.fallback === true,
            version: Number(profile.version) || 1,
            steps: steps,
            destination: profile.destination || '',
            destinationRules: profile.destinationRules || profile.destination || '',
            allowedFields: Array.isArray(profile.allowedFields) ? profile.allowedFields : splitLines(profile.allowedFields),
            matching: {
                extensions: Array.isArray(matching.extensions) ? matching.extensions : splitLines(matching.extensions),
                keywords: Array.isArray(matching.keywords) ? matching.keywords : splitLines(matching.keywords)
            },
            examples: profile.examples || '',
            feedbackNotes: profile.feedbackNotes || '',
            trainingRecords: records,
            versionHistory: history,
            createdAt: profile.createdAt || profile.updatedAt || now(),
            updatedAt: profile.updatedAt || null,
            createdBy: profile.createdBy || 'Operator',
            updatedBy: profile.updatedBy || 'Operator'
        };
    }
    function legacyType(area, profile) {
        return inferDocumentType(area, (profile && profile.name) || '', '') || 'Underwriting cover sheet';
    }
    function migrateSaved(raw, legacy) {
        var result = {};
        var source = raw && typeof raw === 'object' ? raw : {};
        if (source.profiles && typeof source.profiles === 'object') source = source.profiles;
        Object.keys(source).forEach(function (key) {
            var item = source[key];
            if (Array.isArray(item)) {
                item.forEach(function (entry) {
                    var p = normalizeProfile(entry, entry.uploadArea || key, entry.documentType);
                    result[p.id] = p;
                });
                return;
            }
            var p = normalizeProfile(item, item && item.uploadArea || key, legacy ? legacyType(key, item) : item && item.documentType);
            if (legacy) {
                p.id = key + '::' + p.documentType.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                p.uploadArea = key;
                p.uploadLabel = p.uploadLabel || key;
                p.isDefault = true;
            }
            result[p.id] = p;
        });
        return enforceDefaultInvariant(result);
    }
    function enforceDefaultInvariant(source) {
        var groups = {};
        Object.keys(source || {}).forEach(function (key) {
            var profile = source[key];
            if (!profile) return;
            var groupKey = String(profile.uploadArea) + '\u0000' + String(profile.documentType);
            groups[groupKey] = groups[groupKey] || [];
            groups[groupKey].push(profile);
        });
        Object.keys(groups).forEach(function (groupKey) {
            var group = groups[groupKey];
            var active = group.filter(function (profile) { return profile.active; });
            var preferred = active.filter(function (profile) { return profile.isDefault; })[0] || active[0] || null;
            group.forEach(function (profile) {
                profile.isDefault = !!preferred && profile.id === preferred.id;
            });
        });
        return source;
    }
    function loadProfiles() {
        try {
            var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (raw) return migrateSaved(raw, false);
            var old = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
            if (old) {
                var migrated = migrateSaved(old, true);
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, profiles: migrated }));
                audit('Profiles migrated', Object.keys(migrated).length + ' legacy profile(s) migrated to the governed catalog.', true);
                return migrated;
            }
        } catch (_) {}
        return {};
    }
    function saveProfiles() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, profiles: profiles }));
        if (window.StopLossCloud && typeof window.StopLossCloud.queueWorkspaceStateSync === 'function') window.StopLossCloud.queueWorkspaceStateSync();
    }
    function audit(event, detail, quiet) {
        var T = window.TINUBU = window.TINUBU || {};
        T.audit = Array.isArray(T.audit) ? T.audit : [];
        var entry = { id: uid('AI-UP'), timestamp: now(), category: 'AI Upload Prompts', event: event, detail: detail || '', status: 'Recorded' };
        T.audit.unshift(entry);
        if (!quiet && typeof T.log === 'function') {
            try { T.log('AI Upload Prompts', event + (detail ? ': ' + detail : ''), 'System'); } catch (_) {}
        }
        return entry;
    }
    function allProfiles() {
        return Object.keys(profiles).map(function (key) { return profiles[key]; }).filter(Boolean).sort(function (a, b) {
            return String(a.uploadArea).localeCompare(String(b.uploadArea)) || String(a.documentType).localeCompare(String(b.documentType)) || String(a.name).localeCompare(String(b.name));
        });
    }
    function profilesForArea(area, type) {
        return allProfiles().filter(function (profile) {
            return profile.uploadArea === area && (!type || profile.documentType === type);
        });
    }
    function activeProfilesForArea(area, type) {
        return profilesForArea(area, type).filter(function (profile) { return profile.active; });
    }
    function defaultProfile(input, type, areaOverride) {
        var area = areaOverride || defaultArea(input);
        var choices = activeProfilesForArea(area, type);
        return choices.filter(function (profile) { return profile.isDefault; })[0] || choices[0] || null;
    }
    function defaultDraft(input, areaOverride, type) {
        var area = areaOverride || defaultArea(input);
        var documentType = type || inferDocumentType(area, '', '') || 'Underwriting cover sheet';
        return normalizeProfile({
            uploadArea: area,
            uploadLabel: titleFor(input, areaOverride ? 'RFP / PDF intake' : ''),
            documentType: documentType,
            name: titleFor(input, 'Document') + ' · ' + documentTypeLabel(documentType),
            isDefault: activeProfilesForArea(area, documentType).length === 0
        }, area, type);
    }
    function ensureRoot() {
        var root = document.getElementById(ROOT_ID);
        if (root) return root;
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
        return root;
    }
    function close() {
        ensureRoot().innerHTML = '';
        activeInput = null;
        pendingChoice = null;
    }
    function toast(message, bad) {
        ensureRoot().innerHTML = '<div class="ai-upload-prompts-toast ' + (bad ? 'is-error' : '') + '" role="status">' + escapeHtml(message) + '</div>';
        setTimeout(close, 6000);
    }
    function field(label, id, value, help, multiline) {
        return '<label>' + escapeHtml(label) + (help ? '<span class="ai-upload-prompts-help">' + escapeHtml(help) + '</span>' : '') +
            (multiline ? '<textarea id="' + id + '" rows="4">' + escapeHtml(value) + '</textarea>' : '<input id="' + id + '" value="' + escapeHtml(value) + '">') + '</label>';
    }
    function renderCatalog(area, input) {
        activeInput = input || activeInput;
        var list = allProfiles();
        var rows = list.map(function (p) {
            var state = p.active ? '<span class="ai-status ai-status-active">Active</span>' : '<span class="ai-status ai-status-inactive">Inactive</span>';
            var fallback = p.isDefault ? '<span class="ai-status ai-status-default">Default</span>' : '';
            return '<tr><td><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(p.uploadLabel || p.uploadArea) + '</small></td>' +
                '<td>' + escapeHtml(documentTypeLabel(p.documentType)) + '</td><td>' + state + ' ' + fallback + '</td>' +
                '<td>v' + p.version + '<small>' + escapeHtml(p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'Not saved') + '</small></td>' +
                '<td><small>' + escapeHtml((p.allowedFields || []).slice(0, 3).join(', ') || 'Review only') + '</small></td>' +
                '<td class="ai-catalog-actions"><button type="button" data-ai-edit="' + escapeHtml(p.id) + '">Edit</button><button type="button" data-ai-duplicate="' + escapeHtml(p.id) + '">Duplicate</button>' +
                (p.active ? '<button type="button" data-ai-toggle="' + escapeHtml(p.id) + '">Deactivate</button>' : '<button type="button" data-ai-toggle="' + escapeHtml(p.id) + '">Activate</button>') +
                (p.isDefault ? '' : '<button type="button" data-ai-default="' + escapeHtml(p.id) + '">Make default</button>') +
                '<button type="button" class="is-danger" data-ai-delete="' + escapeHtml(p.id) + '">Delete</button></td></tr>';
        }).join('');
        var context = area ? '<span class="ai-catalog-context">Upload area: <strong>' + escapeHtml(area) + '</strong></span>' : '';
        ensureRoot().innerHTML = '<div class="ai-upload-prompts-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-catalog-title"><section class="ai-upload-prompts-modal ai-upload-prompts-catalog">' +
            '<header><div><h2 id="ai-catalog-title">AI Prompts catalog</h2><p>Governed profiles are selected by upload area and document type before extraction. ' + context + '</p></div><button type="button" data-ai-close aria-label="Close catalog">&times;</button></header>' +
            '<div class="ai-upload-prompts-content"><div class="ai-catalog-toolbar"><button type="button" class="ai-upload-prompts-primary" data-ai-new>+ Create profile</button><span class="ai-upload-prompts-help">Profiles are versioned. Deactivating or deleting a default safely promotes another active profile when one exists.</span></div>' +
            (rows ? '<div class="ai-catalog-table-wrap"><table class="ai-upload-prompts-table ai-catalog-table"><thead><tr><th>Profile</th><th>Document type</th><th>Status</th><th>Version / updated</th><th>Destination fields</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="ai-upload-prompts-notice">No governed profiles exist yet. Create one before enabling AI extraction for an upload area.</div>') +
            '<div class="ai-catalog-note"><strong>Human review remains required.</strong> Profiles control instructions and permitted destinations; they do not fine-tune Gemini or authorize automatic field changes.</div></div>' +
            '<footer><button type="button" class="ai-upload-prompts-secondary" data-ai-close>Close</button></footer></section></div>';
        bindCatalog(area, input);
    }
    function bindCatalog(area, input) {
        var root = ensureRoot();
        root.querySelectorAll('[data-ai-close]').forEach(function (button) { button.onclick = close; });
        var newButton = root.querySelector('[data-ai-new]');
        if (newButton) newButton.onclick = function () { openEditor(input, defaultDraft(input, area || defaultArea(input))); };
        root.querySelectorAll('[data-ai-edit]').forEach(function (button) { button.onclick = function () { openEditor(input, profiles[button.getAttribute('data-ai-edit')]); }; });
        root.querySelectorAll('[data-ai-duplicate]').forEach(function (button) { button.onclick = function () {
            if (duplicateProfile(button.getAttribute('data-ai-duplicate'))) renderCatalog(area, input);
        }; });
        root.querySelectorAll('[data-ai-toggle]').forEach(function (button) { button.onclick = function () {
            var profile = profiles[button.getAttribute('data-ai-toggle')];
            if (!profile) return;
            if (setProfileActive(profile.id, !profile.active)) renderCatalog(area, input);
        }; });
        root.querySelectorAll('[data-ai-default]').forEach(function (button) { button.onclick = function () {
            if (setProfileDefault(button.getAttribute('data-ai-default'))) renderCatalog(area, input);
        }; });
        root.querySelectorAll('[data-ai-delete]').forEach(function (button) { button.onclick = function () {
            var profile = profiles[button.getAttribute('data-ai-delete')];
            if (!profile) return;
            if (!window.confirm('Delete the profile "' + profile.name + '"? Its audit history remains, but this profile will no longer be selectable.')) return;
            if (deleteProfile(profile.id)) renderCatalog(area, input);
        }; });
    }
    function historyEntry(profile, reason) {
        return {
            version: profile.version,
            savedAt: now(),
            reason: reason || 'Updated',
            uploadArea: profile.uploadArea,
            uploadLabel: profile.uploadLabel,
            documentType: profile.documentType,
            name: profile.name,
            active: profile.active,
            isDefault: profile.isDefault,
            destination: profile.destination,
            destinationRules: profile.destinationRules,
            allowedFields: clone(profile.allowedFields),
            steps: clone(profile.steps),
            matching: clone(profile.matching),
            examples: profile.examples,
            feedbackNotes: profile.feedbackNotes
        };
    }
    function setDefault(profile) {
        allProfiles().forEach(function (other) {
            if (other.uploadArea === profile.uploadArea && other.documentType === profile.documentType) other.isDefault = other.id === profile.id;
        });
        profile.isDefault = true;
    }
    function promoteDefault(area, type, exceptId) {
        var replacement = activeProfilesForArea(area, type).filter(function (p) { return p.id !== exceptId; })[0];
        if (replacement) setDefault(replacement);
    }
    function ensureDefault(area, type) {
        var choices = activeProfilesForArea(area, type);
        if (!choices.length) return null;
        var current = choices.filter(function (profile) { return profile.isDefault; })[0];
        if (!current) {
            setDefault(choices[0]);
            return choices[0];
        }
        choices.forEach(function (profile) {
            profile.isDefault = profile.id === current.id;
        });
        return current;
    }
    function saveProfileRecord(draft, area, eventName) {
        var old = profiles[draft.id];
        var updated = normalizeProfile(draft, area);
        profiles[updated.id] = updated;
        if (updated.isDefault && updated.active) setDefault(updated);
        else updated.isDefault = false;
        if (old && old.isDefault && (old.uploadArea !== updated.uploadArea || old.documentType !== updated.documentType)) {
            promoteDefault(old.uploadArea, old.documentType, updated.id);
        }
        if (!updated.active && old && old.isDefault) promoteDefault(updated.uploadArea, updated.documentType, updated.id);
        ensureDefault(updated.uploadArea, updated.documentType);
        if (old && old.isDefault) ensureDefault(old.uploadArea, old.documentType);
        saveProfiles();
        audit(eventName || (old ? 'Profile updated' : 'Profile created'), updated.name + ' · ' + updated.documentType + ' · v' + updated.version);
        return clone(updated);
    }
    function createProfile(profile, area) {
        var draft = Object.assign({}, profile || {});
        draft.id = draft.id || uid('AIP');
        draft.version = 1;
        draft.versionHistory = [];
        return saveProfileRecord(draft, area, 'Profile created');
    }
    function updateProfile(id, changes) {
        var old = profiles[id];
        if (!old) return null;
        var draft = Object.assign({}, old, changes || {}, {
            id: id,
            version: old.version + 1,
            versionHistory: (old.versionHistory || []).concat([historyEntry(old, 'Saved revision')]),
            createdAt: old.createdAt
        });
        return saveProfileRecord(draft, old.uploadArea, 'Profile updated');
    }
    function restoreProfileVersion(id, version) {
        var current = profiles[id];
        if (!current) return null;
        var revision = (current.versionHistory || []).filter(function (entry) {
            return Number(entry.version) === Number(version);
        })[0];
        if (!revision) return null;
        var beforeRestore = historyEntry(current, 'Saved before restoring v' + revision.version);
        var restored = Object.assign({}, current, {
            uploadArea: revision.uploadArea || current.uploadArea,
            uploadLabel: Object.prototype.hasOwnProperty.call(revision, 'uploadLabel') ? revision.uploadLabel : current.uploadLabel,
            documentType: revision.documentType || current.documentType,
            name: Object.prototype.hasOwnProperty.call(revision, 'name') ? revision.name : current.name,
            active: Object.prototype.hasOwnProperty.call(revision, 'active') ? revision.active : current.active,
            isDefault: revision.isDefault === true,
            destination: Object.prototype.hasOwnProperty.call(revision, 'destination') ? revision.destination : current.destination,
            destinationRules: Object.prototype.hasOwnProperty.call(revision, 'destinationRules') ? revision.destinationRules : (Object.prototype.hasOwnProperty.call(revision, 'destination') ? revision.destination : current.destinationRules),
            allowedFields: Object.prototype.hasOwnProperty.call(revision, 'allowedFields') ? clone(revision.allowedFields) : clone(current.allowedFields),
            steps: Object.prototype.hasOwnProperty.call(revision, 'steps') ? clone(revision.steps) : clone(current.steps),
            matching: Object.prototype.hasOwnProperty.call(revision, 'matching') ? clone(revision.matching) : clone(current.matching),
            examples: Object.prototype.hasOwnProperty.call(revision, 'examples') ? revision.examples : current.examples,
            feedbackNotes: Object.prototype.hasOwnProperty.call(revision, 'feedbackNotes') ? revision.feedbackNotes : current.feedbackNotes,
            version: current.version + 1,
            versionHistory: (current.versionHistory || []).concat([beforeRestore]),
            createdAt: current.createdAt,
            updatedAt: now(),
            updatedBy: 'Operator'
        });
        return saveProfileRecord(restored, current.uploadArea, 'Profile restored');
    }
    function profileVersionForComparison(current, revision) {
        var historical = Object.assign({}, current, revision || {}, {
            id: current.id,
            versionHistory: [],
            allowedFields: Object.prototype.hasOwnProperty.call(revision || {}, 'allowedFields') ? clone(revision.allowedFields) : clone(current.allowedFields),
            steps: Object.prototype.hasOwnProperty.call(revision || {}, 'steps') ? clone(revision.steps) : clone(current.steps),
            matching: Object.prototype.hasOwnProperty.call(revision || {}, 'matching') ? clone(revision.matching) : clone(current.matching)
        });
        return normalizeProfile(historical, current.uploadArea, current.documentType);
    }
    function compareProfileVersion(id, version) {
        var current = profiles[id];
        if (!current) return null;
        var revision = (current.versionHistory || []).filter(function (entry) {
            return Number(entry.version) === Number(version);
        })[0];
        if (!revision) return null;
        return { current: clone(current), revision: clone(profileVersionForComparison(current, revision)), revisionEntry: clone(revision) };
    }
    function duplicateProfile(id) {
        var original = profiles[id];
        if (!original) return null;
        var copy = normalizeProfile(clone(original), original.uploadArea, original.documentType);
        copy.id = uid('AIP');
        copy.name = original.name + ' copy';
        copy.isDefault = false;
        copy.version = 1;
        copy.versionHistory = [];
        copy.createdAt = now();
        copy.updatedAt = null;
        profiles[copy.id] = copy;
        ensureDefault(copy.uploadArea, copy.documentType);
        saveProfiles();
        audit('Profile duplicated', copy.name + ' from ' + original.id);
        return clone(copy);
    }
    function setProfileActive(id, active) {
        var profile = profiles[id];
        if (!profile) return null;
        var wasDefault = profile.isDefault;
        profile.active = active !== false;
        if (!profile.active) profile.isDefault = false;
        profile.updatedAt = now();
        profile.version += 1;
        profile.versionHistory = (profile.versionHistory || []).concat([historyEntry(profile, 'Status changed')]);
        if (wasDefault && !profile.active) promoteDefault(profile.uploadArea, profile.documentType, profile.id);
        ensureDefault(profile.uploadArea, profile.documentType);
        saveProfiles();
        audit(profile.active ? 'Profile activated' : 'Profile deactivated', profile.name + ' v' + profile.version);
        return clone(profile);
    }
    function setProfileDefault(id) {
        var profile = profiles[id];
        if (!profile || !profile.active) return null;
        setDefault(profile);
        saveProfiles();
        audit('Default profile changed', profile.name + ' for ' + profile.uploadArea + ' / ' + profile.documentType);
        return clone(profile);
    }
    function deleteProfile(id) {
        var profile = profiles[id];
        if (!profile) return null;
        var wasDefault = profile.isDefault;
        delete profiles[id];
        if (wasDefault) promoteDefault(profile.uploadArea, profile.documentType);
        ensureDefault(profile.uploadArea, profile.documentType);
        saveProfiles();
        audit('Profile deleted', profile.name + ' (' + profile.id + ')');
        return clone(profile);
    }
    function editorOptions(profile) {
        return DOCUMENT_TYPES.map(function (type) { return '<option value="' + escapeHtml(type.value) + '" ' + (type.value === profile.documentType ? 'selected' : '') + '>' + escapeHtml(type.label) + '</option>'; }).join('');
    }
    function comparisonValue(value) {
        if (Array.isArray(value)) {
            return value.length ? '<ul>' + value.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>' : '<span class="ai-profile-comparison-empty">Not configured</span>';
        }
        var text = String(value == null ? '' : value);
        return text ? '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>' : '<span class="ai-profile-comparison-empty">Not configured</span>';
    }
    function comparisonScope(profile) {
        return 'Profile: ' + (profile.name || 'Unnamed profile') + '\nUpload area: ' + (profile.uploadArea || 'Not configured') + '\nDocument type: ' + documentTypeLabel(profile.documentType);
    }
    function comparisonValuesEqual(currentValue, revisionValue) {
        if (Array.isArray(currentValue) || Array.isArray(revisionValue)) {
            return JSON.stringify(Array.isArray(currentValue) ? currentValue : []) === JSON.stringify(Array.isArray(revisionValue) ? revisionValue : []);
        }
        return String(currentValue == null ? '' : currentValue) === String(revisionValue == null ? '' : revisionValue);
    }
    function comparisonField(label, currentValue, revisionValue) {
        var changed = !comparisonValuesEqual(currentValue, revisionValue);
        return '<div class="ai-profile-comparison-field' + (changed ? ' is-changed' : '') + '" data-ai-comparison-state="' + (changed ? 'changed' : 'unchanged') + '"><h4>' + escapeHtml(label) + (changed ? '<span class="ai-profile-comparison-change-status">Changed</span>' : '') + '</h4><div class="ai-profile-comparison-values"><div' + (changed ? ' class="is-changed-value"' : '') + '>' + comparisonValue(currentValue) + '</div><div' + (changed ? ' class="is-changed-value"' : '') + '>' + comparisonValue(revisionValue) + '</div></div></div>';
    }
    function closeComparison() {
        var root = ensureRoot(), comparison = root.querySelector('.ai-profile-comparison-overlay');
        if (comparison && comparison.parentNode) comparison.parentNode.removeChild(comparison);
    }
    function openComparison(input, id, version) {
        var comparison = compareProfileVersion(id, version);
        if (!comparison) return;
        var current = comparison.current, revision = comparison.revision, revisionEntry = comparison.revisionEntry;
        var root = ensureRoot();
        closeComparison();
        root.insertAdjacentHTML('beforeend', '<div class="ai-upload-prompts-overlay ai-profile-comparison-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-profile-comparison-title">' +
            '<section class="ai-upload-prompts-modal ai-profile-comparison-modal"><header><div><h2 id="ai-profile-comparison-title">Compare prompt revisions</h2><p>Review the historical revision before deciding whether to restore it.</p></div><button type="button" data-ai-comparison-cancel aria-label="Close comparison">&times;</button></header>' +
            '<div class="ai-upload-prompts-content"><div class="ai-profile-comparison-callout"><strong>Restore candidate: v' + escapeHtml(revision.version) + '</strong><span>Nothing has changed. The historical revision will be restored only after you confirm the restore action below.</span></div>' +
            '<div class="ai-profile-comparison-headings"><div><strong>Current active version</strong><span>v' + escapeHtml(current.version) + '</span></div><div><strong>Revision to restore</strong><span>v' + escapeHtml(revision.version) + '</span></div></div>' +
            '<div class="ai-profile-comparison-grid">' +
            comparisonField('Prompt instructions', current.steps, revision.steps) +
            comparisonField('Destination rules', current.destinationRules || current.destination, revision.destinationRules || revision.destination) +
            comparisonField('Allowed destination fields', current.allowedFields, revision.allowedFields) +
            comparisonField('Examples / expected patterns', current.examples, revision.examples) +
            comparisonField('Scope', comparisonScope(current), comparisonScope(revision)) +
            '</div><p class="ai-upload-prompts-help">Saved ' + escapeHtml(revisionEntry.savedAt || '') + ' · ' + escapeHtml(revisionEntry.reason || 'Saved revision') + '</p></div>' +
            '<footer><button type="button" class="ai-upload-prompts-secondary" data-ai-comparison-cancel>Cancel</button><button type="button" class="ai-upload-prompts-primary" data-ai-comparison-restore data-ai-restore="' + escapeHtml(id) + '" data-ai-version="' + escapeHtml(revision.version) + '">Restore this revision (v' + escapeHtml(revision.version) + ')</button></footer></section></div>');
        root.querySelectorAll('[data-ai-comparison-cancel]').forEach(function (button) { button.onclick = closeComparison; });
        root.querySelector('[data-ai-comparison-restore]').onclick = function () {
            if (window.confirm && !window.confirm('Restore version ' + revision.version + ' of "' + current.name + '"? This creates a new version and preserves the current version in history.')) return;
            var restored = restoreProfileVersion(id, revision.version);
            if (restored) openEditor(input, restored);
        };
    }
    function openEditor(input, profile) {
        activeInput = input || activeInput;
        var area = profile && profile.uploadArea || defaultArea(input);
        var p = normalizeProfile(profile || defaultDraft(input, area), area);
        var isNew = !profiles[p.id];
        ensureRoot().innerHTML = '<div class="ai-upload-prompts-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-editor-title"><section class="ai-upload-prompts-modal ai-upload-prompts-editor">' +
            '<header><div><h2 id="ai-editor-title">' + (isNew ? 'Create AI prompt profile' : 'Edit AI prompt profile') + '</h2><p>' + escapeHtml(p.uploadLabel || area) + ' · version ' + p.version + '</p></div><button type="button" data-ai-close aria-label="Close editor">&times;</button></header>' +
            '<div class="ai-upload-prompts-content"><div class="ai-editor-grid">' +
            field('Profile name', 'ai-profile-name', p.name) + field('Upload area key', 'ai-profile-area', p.uploadArea, 'Profiles in the same upload area can cover multiple document types.') +
            '<label>Document type<span class="ai-upload-prompts-help">The operator must confirm this type before extraction.</span><select id="ai-profile-document-type">' + editorOptions(p) + '</select></label>' +
            '<label class="ai-checkbox-label"><input id="ai-profile-active" type="checkbox" ' + (p.active ? 'checked' : '') + '> Active and selectable</label><label class="ai-checkbox-label"><input id="ai-profile-default" type="checkbox" ' + (p.isDefault ? 'checked' : '') + '> Default for this upload area and document type</label>' +
            '</div>' +
            field('Ordered extraction instructions', 'ai-profile-steps', p.steps.join('\n'), 'One instruction per line; order is preserved.', true) +
            field('Destination rules', 'ai-profile-destination', p.destinationRules || p.destination, 'Explain where values may go and when to leave them blank.', true) +
            field('Allowed destination field IDs or names', 'ai-profile-fields', p.allowedFields.join('\n'), 'Only these exact IDs/names can be proposed for review or mapping.', true) +
            '<div class="ai-editor-grid">' + field('Matching extensions', 'ai-profile-extensions', (p.matching.extensions || []).join(', '), 'Optional, for example: .pdf, .csv, .xlsx') + field('Matching keywords', 'ai-profile-keywords', (p.matching.keywords || []).join(', '), 'Optional words in the file name or upload context') + '</div>' +
            field('Examples / expected patterns', 'ai-profile-examples', p.examples, 'Prompt examples are training-ready notes only; no external fine-tuning occurs.', true) +
            field('Feedback notes', 'ai-profile-feedback', p.feedbackNotes, 'Record operator guidance for future prompt revisions.', true) +
            '<div class="ai-profile-history"><strong>Version history</strong><span class="ai-upload-prompts-help">Restoring a revision creates a new version and keeps every intervening revision.</span>' + ((p.versionHistory || []).slice().reverse().map(function (entry) {
                return '<div class="ai-profile-history-row"><span>v' + escapeHtml(entry.version) + '</span><span class="ai-profile-history-details">' + escapeHtml(entry.reason || 'Saved') + ' · ' + escapeHtml(entry.savedAt || '') + '</span><button type="button" class="ai-profile-history-compare" data-ai-compare="' + escapeHtml(p.id) + '" data-ai-version="' + escapeHtml(entry.version) + '">Compare revision</button></div>';
            }).join('') || '<div class="ai-upload-prompts-help">No prior versions.</div>') + '</div><div id="ai-upload-prompts-message" role="status"></div></div>' +
            '<footer><button type="button" class="ai-upload-prompts-secondary" data-ai-catalog>Back to catalog</button><button type="button" class="ai-upload-prompts-secondary" data-ai-close>Cancel</button><button type="button" class="ai-upload-prompts-primary" data-ai-save>Save profile</button></footer></section></div>';
        var root = ensureRoot();
        root.querySelectorAll('[data-ai-close]').forEach(function (button) { button.onclick = close; });
        root.querySelector('[data-ai-catalog]').onclick = function () { renderCatalog(area, input); };
        root.querySelectorAll('[data-ai-compare]').forEach(function (button) {
            button.onclick = function () {
                var id = button.getAttribute('data-ai-compare');
                var version = button.getAttribute('data-ai-version');
                openComparison(input, id, version);
            };
        });
        root.querySelector('[data-ai-save]').onclick = function () {
            var old = profiles[p.id];
            var updated = normalizeProfile({
                id: p.id,
                uploadArea: root.querySelector('#ai-profile-area').value.trim() || area,
                uploadLabel: p.uploadLabel || titleFor(input, area),
                documentType: root.querySelector('#ai-profile-document-type').value,
                name: root.querySelector('#ai-profile-name').value.trim(),
                active: root.querySelector('#ai-profile-active').checked,
                isDefault: root.querySelector('#ai-profile-default').checked,
                version: old ? old.version + 1 : 1,
                steps: splitLines(root.querySelector('#ai-profile-steps').value),
                destination: root.querySelector('#ai-profile-destination').value.trim(),
                destinationRules: root.querySelector('#ai-profile-destination').value.trim(),
                allowedFields: splitLines(root.querySelector('#ai-profile-fields').value),
                matching: { extensions: splitLines(root.querySelector('#ai-profile-extensions').value), keywords: splitLines(root.querySelector('#ai-profile-keywords').value) },
                examples: root.querySelector('#ai-profile-examples').value.trim(),
                feedbackNotes: root.querySelector('#ai-profile-feedback').value.trim(),
                versionHistory: old ? (old.versionHistory || []).concat([historyEntry(old, 'Saved revision')]) : [],
                createdAt: old && old.createdAt,
                updatedAt: now(),
                createdBy: old && old.createdBy || 'Operator',
                updatedBy: 'Operator'
            }, area);
            if (!updated.name) { root.querySelector('#ai-upload-prompts-message').textContent = 'Profile name is required.'; return; }
            if (!updated.steps.length) { root.querySelector('#ai-upload-prompts-message').textContent = 'Add at least one ordered instruction.'; return; }
            saveProfileRecord(updated, area, isNew ? 'Profile created' : 'Profile updated');
            renderCatalog(area, input);
        };
    }
    function matchingProfiles(area, file, type) {
        var ext = '.' + String(file && file.name || '').split('.').pop().toLowerCase();
        var name = String(file && file.name || '').toLowerCase();
        return activeProfilesForArea(area, type).filter(function (profile) {
            var extensions = (profile.matching && profile.matching.extensions || []).map(function (x) { return String(x).toLowerCase().replace(/^\./, '.'); });
            var keywords = (profile.matching && profile.matching.keywords || []).map(function (x) { return String(x).toLowerCase(); });
            var extensionOk = !extensions.length || extensions.indexOf(ext) >= 0;
            var keywordOk = !keywords.length || keywords.some(function (word) { return name.indexOf(word) >= 0; });
            return extensionOk && keywordOk;
        });
    }
    function chooseProfile(input, file, options) {
        options = options || {};
        var area = options.uploadArea || defaultArea(input);
        var inferred = options.documentType || inferDocumentType(area, file && file.name, file && file.type);
        var candidates = allProfiles().filter(function (profile) { return profile.uploadArea === area && profile.active; });
        if (options.requiredType && !inferred) inferred = options.requiredType;
        return new Promise(function (resolve) {
            pendingChoice = { resolve: resolve, input: input, file: file, area: area, inferred: inferred, candidates: candidates, allowNoProfile: options.allowNoProfile !== false };
            renderChoice();
        });
    }
    function renderChoice() {
        var state = pendingChoice;
        if (!state) return;
        var types = DOCUMENT_TYPES.map(function (type) {
            var selected = type.value === state.inferred ? 'selected' : '';
            return '<option value="' + escapeHtml(type.value) + '" ' + selected + '>' + escapeHtml(type.label) + ' — ' + escapeHtml(type.hint) + '</option>';
        }).join('');
        var profileOptions = '<option value="">Choose a matching active profile…</option>' + state.candidates.map(function (p) {
            return '<option value="' + escapeHtml(p.id) + '" data-type="' + escapeHtml(p.documentType) + '">' + escapeHtml(p.name) + ' · ' + escapeHtml(documentTypeLabel(p.documentType)) + ' · v' + p.version + (p.isDefault ? ' · default' : '') + '</option>';
        }).join('');
        var inferredText = state.inferred ? 'Filename/context suggests <strong>' + escapeHtml(documentTypeLabel(state.inferred)) + '</strong>; confirm or change it.' : 'No supported type could be inferred from the filename/context. Choose one explicitly.';
        ensureRoot().innerHTML = '<div class="ai-upload-prompts-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-choice-title"><section class="ai-upload-prompts-modal ai-upload-prompts-choice">' +
            '<header><div><h2 id="ai-choice-title">Identify document before extraction</h2><p>' + escapeHtml(state.file && state.file.name) + ' · ' + escapeHtml(state.area) + '</p></div><button type="button" data-ai-cancel aria-label="Cancel">&times;</button></header>' +
            '<div class="ai-upload-prompts-content"><div class="ai-classification-callout"><strong>Required operator confirmation</strong><span>' + inferredText + '</span></div>' +
            '<label>Document type<select id="ai-choice-type">' + types + '</select></label>' +
            '<label>Matching active prompt profile<select id="ai-choice-profile">' + profileOptions + '</select><span class="ai-upload-prompts-help">The profile version shown here is the version that will be recorded in review and audit provenance.</span></label>' +
            (state.candidates.length ? '<div class="ai-choice-candidates"><strong>Active profiles in this upload area</strong><span>' + state.candidates.map(function (p) { return escapeHtml(p.name) + ' · ' + escapeHtml(documentTypeLabel(p.documentType)) + ' v' + p.version; }).join(' · ') + '</span></div>' : '<div class="ai-upload-prompts-notice">No active profile is configured for this upload area yet. Use the catalog to create one, or continue only with the existing browser extraction/manual review path.</div>') +
             '<label class="ai-checkbox-label"><input id="ai-choice-ack" type="checkbox"> I confirmed the document type and understand that human evidence review remains required.</label><div id="ai-choice-message" class="ai-upload-prompts-validation" role="alert"></div></div>' +
            '<footer><button type="button" class="ai-upload-prompts-secondary" data-ai-catalog>Open AI Prompts catalog</button><button type="button" class="ai-upload-prompts-secondary" data-ai-cancel>Cancel</button><button type="button" class="ai-upload-prompts-primary" data-ai-continue>Continue with selected type</button></footer></section></div>';
        var root = ensureRoot();
        root.querySelectorAll('[data-ai-cancel]').forEach(function (button) { button.onclick = function () { finishChoice({ cancelled: true }); }; });
        root.querySelector('[data-ai-catalog]').onclick = function () { renderCatalog(state.area, state.input); };
        root.querySelector('[data-ai-continue]').onclick = function () {
            var type = root.querySelector('#ai-choice-type').value;
            var profileId = root.querySelector('#ai-choice-profile').value;
            var acknowledged = root.querySelector('#ai-choice-ack').checked;
             if (!acknowledged) { root.querySelector('#ai-choice-message').textContent = 'Confirm the document type before continuing.'; return; }
            var profile = profileId ? profiles[profileId] : defaultProfile(state.input, type, state.area);
            if (profile && profile.documentType !== type) profile = null;
             if (!profile && !state.allowNoProfile) { root.querySelector('#ai-choice-message').textContent = 'No active profile matches this document type. Create or activate one in the catalog.'; return; }
            audit('Document type confirmed', state.file.name + ' · ' + documentTypeLabel(type) + (profile ? ' · ' + profile.name + ' v' + profile.version : ' · browser extraction only'));
            finishChoice({ confirmed: true, documentType: type, profile: profile || null, area: state.area, operatorDecision: 'Confirmed before extraction' });
        };
    }
    function finishChoice(result) {
        var state = pendingChoice;
        pendingChoice = null;
        if (state && state.resolve) state.resolve(result);
        if (result && result.cancelled) close();
    }
    function textFromFile(file, profile) {
        var name = (file.name || '').toLowerCase();
        if (window.StopLossGemini && typeof window.StopLossGemini.extract === 'function' && profile) {
            return Promise.resolve(window.StopLossGemini.extract(file, {
                profileId: profile.id,
                profileVersion: profile.version,
                documentType: profile.documentType,
                steps: profile.steps.slice(),
                destination: profile.destinationRules || profile.destination,
                allowedFields: profile.allowedFields.slice(),
                examples: profile.examples
            }));
        }
        if (/\.pdf$/.test(name) && window.pdfjsLib) {
            return file.arrayBuffer().then(function (bytes) {
                return window.pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
                    var pages = [];
                    for (var i = 1; i <= pdf.numPages; i += 1) pages.push(pdf.getPage(i).then(function (page) {
                        return page.getTextContent().then(function (content) { return content.items.map(function (item) { return item.str; }).join(' '); });
                    }));
                    return Promise.all(pages).then(function (items) { return { text: items.join('\n'), source: 'PDF.js' }; });
                });
            });
        }
        if (/\.(xlsx|xls|csv)$/.test(name) && window.XLSX) {
            return file.arrayBuffer().then(function (bytes) {
                var workbook = window.XLSX.read(bytes, { type: 'array' });
                var text = workbook.SheetNames.map(function (sheet) { return window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]); }).join('\n');
                return { text: text, source: 'XLSX' };
            });
        }
        if (file.type.indexOf('text/') === 0 || /\.(txt|json|xml|html|htm|csv)$/.test(name)) return file.text().then(function (text) { return { text: text, source: 'Browser text reader' }; });
        return Promise.reject(new Error('No configured extractor or supported browser reader is available for this file type.'));
    }
    function normalize(result) {
        if (typeof result === 'string') return { text: result, values: {}, source: 'configured extractor' };
        result = result || {};
        return { text: result.text || result.content || '', values: result.values || result.fields || result.mappings || {}, source: result.source || 'configured extractor', outcome: result.outcome || 'Completed', confidence: result.confidence || '' };
    }
    function extractForUpload(input, file, choice) {
        var p = choice.profile;
        if (!p) {
            audit('Extraction blocked', file.name + ' · no active profile for confirmed ' + choice.documentType);
            toast('No active prompt profile matches this document type. The file was not sent for AI extraction.', true);
            return;
        }
        audit('Extraction started', file.name + ' · ' + choice.documentType + ' · ' + p.id + ' v' + p.version);
        textFromFile(file, p).then(function (result) {
            var normalized = normalize(result);
            reviewState = { input: input, file: file, profile: p, documentType: choice.documentType, area: choice.area, result: normalized, candidates: normalized.values && typeof normalized.values === 'object' ? normalized.values : {}, selectedAt: now() };
            audit('Extraction completed', file.name + ' · profile ' + p.id + ' v' + p.version + ' · ' + normalized.outcome);
            showReview();
        }).catch(function (error) {
            audit('Extraction failed', file.name + ' · profile ' + p.id + ' v' + p.version + ' · ' + error.message);
            toast('Extraction could not be completed: ' + error.message, true);
        });
    }
    function showReview() {
        var state = reviewState, p = state.profile, allowed = p.allowedFields || [], candidates = state.candidates;
        var rows = allowed.map(function (key) {
            var value = Object.prototype.hasOwnProperty.call(candidates, key) ? candidates[key] : '';
            return '<tr><td>' + escapeHtml(key) + '</td><td><input data-ai-map="' + escapeHtml(key) + '" value="' + escapeHtml(value == null ? '' : value) + '"></td></tr>';
        }).join('');
        var none = !allowed.length ? '<p class="ai-upload-prompts-notice">No allowed fields are configured. Extraction remains a review report and cannot update the form.</p>' : '';
        ensureRoot().innerHTML = '<div class="ai-upload-prompts-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-review-title"><section class="ai-upload-prompts-modal">' +
            '<header><div><h2 id="ai-review-title">Review extracted values</h2><p>' + escapeHtml(state.file.name) + ' · ' + escapeHtml(documentTypeLabel(state.documentType)) + ' · prompt v' + p.version + '</p></div><button type="button" data-ai-close aria-label="Close review">&times;</button></header>' +
            '<div class="ai-upload-prompts-content"><div class="ai-review-provenance"><span><strong>Profile</strong> ' + escapeHtml(p.name) + '</span><span><strong>Destination</strong> ' + escapeHtml(p.destinationRules || p.destination || 'Review only') + '</span><span><strong>Extractor</strong> ' + escapeHtml(state.result.source) + '</span></div>' + none +
            '<p class="ai-upload-prompts-help">Only explicitly allowed fields appear below. Nothing is mapped until you select Apply reviewed values.</p>' +
            (rows ? '<table class="ai-upload-prompts-table"><thead><tr><th>Allowed field</th><th>Reviewed value</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
            '<label>Operator feedback / review note<textarea id="ai-review-feedback" rows="3" placeholder="Optional: note a correction, mismatch, or useful example"></textarea></label>' +
            '<details><summary>Extracted source text</summary><pre>' + escapeHtml(state.result.text || 'The extractor returned no text.') + '</pre></details></div>' +
            '<footer><button type="button" class="ai-upload-prompts-secondary" data-ai-close>Close</button><button type="button" class="ai-upload-prompts-secondary" data-ai-report>Generate report</button>' + (rows ? '<button type="button" class="ai-upload-prompts-primary" data-ai-apply>Apply reviewed values</button>' : '') + '</footer></section></div>';
        var root = ensureRoot();
        root.querySelectorAll('[data-ai-close]').forEach(function (button) { button.onclick = close; });
        var apply = root.querySelector('[data-ai-apply]'); if (apply) apply.onclick = applyReviewed;
        root.querySelector('[data-ai-report]').onclick = generateReport;
    }
    function targetFor(key) { return document.getElementById(key) || document.querySelector('[name="' + cssEscape(key) + '"]'); }
    function feedbackRecord(state, decision, feedback) {
        var record = { id: uid('AIF'), timestamp: now(), fileName: state.file.name, documentType: state.documentType, profileId: state.profile.id, profileVersion: state.profile.version, extractor: state.result.source, result: state.result.outcome, operatorDecision: decision, feedback: feedback || '' };
        state.profile.trainingRecords = (state.profile.trainingRecords || []).concat([record]).slice(-100);
        profiles[state.profile.id] = state.profile;
        saveProfiles();
        audit('Extraction review recorded', state.file.name + ' · ' + state.documentType + ' · ' + state.profile.id + ' v' + state.profile.version + ' · decision ' + decision + (feedback ? ' · feedback captured' : ''));
    }
    function applyReviewed() {
        var state = reviewState, root = ensureRoot(), mapped = 0;
        (state.profile.allowedFields || []).forEach(function (key) {
            var editor = root.querySelector('[data-ai-map="' + cssEscape(key) + '"]'), target = targetFor(key);
            if (!editor || !target || !editor.value.trim()) return;
            if (target.type === 'checkbox') target.checked = /^(true|yes|1)$/i.test(editor.value);
            else target.value = editor.value;
            target.dispatchEvent(new Event('change', { bubbles: true }));
            mapped += 1;
        });
        var feedback = root.querySelector('#ai-review-feedback').value.trim();
        feedbackRecord(state, 'Applied reviewed values (' + mapped + ' fields)', feedback);
        if (mapped) close(); else generateReport();
    }
    function categoryFor(input) {
        var text = (defaultArea(input) + ' ' + titleFor(input)).toLowerCase();
        if (/invoice|billing|premium|statement|ledger/.test(text)) return 'Billing';
        if (/enroll|census|eligib|member/.test(text)) return 'Enrollment';
        if (/quote|rfp|proposal|loss|claim|plan/.test(text)) return 'Quote Docs';
        return 'UW Docs';
    }
    function reportHtml() {
        var s = reviewState, p = s.profile;
        return '<!doctype html><html><head><meta charset="utf-8"><title>AI extraction review</title><style>body{font:14px Arial;color:#172b3a;margin:40px}h1{color:#003648}pre{white-space:pre-wrap;border:1px solid #ccd6dd;padding:16px}dt{font-weight:bold}dd{margin:0 0 10px}</style></head><body><h1>AI extraction review</h1><dl><dt>File</dt><dd>' + escapeHtml(s.file.name) + '</dd><dt>Document type</dt><dd>' + escapeHtml(s.documentType) + '</dd><dt>Profile</dt><dd>' + escapeHtml(p.name) + ' (version ' + p.version + ', id ' + escapeHtml(p.id) + ')</dd><dt>Destination instructions</dt><dd>' + escapeHtml(p.destinationRules || p.destination) + '</dd><dt>Extractor</dt><dd>' + escapeHtml(s.result.source) + '</dd></dl><h2>Extracted source text</h2><pre>' + escapeHtml(s.result.text || 'No text returned by the selected extractor.') + '</pre></body></html>';
    }
    function generateReport() {
        var s = reviewState, html = reportHtml(), category = categoryFor(s.input), base = 'ai-extraction-review-' + Date.now();
        feedbackRecord(s, 'Report generated; values not applied', ensureRoot().querySelector('#ai-review-feedback') && ensureRoot().querySelector('#ai-review-feedback').value.trim());
        var PdfConstructor = window.jspdf && window.jspdf.jsPDF || window.jsPDF;
        if (PdfConstructor) {
            var pdf = new PdfConstructor();
            pdf.setFontSize(16); pdf.text('AI Extraction Review', 15, 18); pdf.setFontSize(10);
            pdf.text('File: ' + s.file.name, 15, 28); pdf.text('Document type: ' + s.documentType + ' · Prompt v' + s.profile.version, 15, 34);
            var lines = pdf.splitTextToSize(s.result.text || 'No text returned.', 180); pdf.text(lines.slice(0, 245), 15, 44); pdf.save(base + '.pdf');
            if (typeof window.saveGeneratedDocumentToDrive === 'function') window.saveGeneratedDocumentToDrive(base + '.pdf', 'application/pdf', pdf.output('datauristring'), { category: category }).catch(function () {});
        } else {
            var blob = new Blob([html], { type: 'text/html' }), url = URL.createObjectURL(blob), tab = window.open(url, '_blank');
            if (tab) tab.onload = function () { tab.print(); };
            if (typeof window.saveGeneratedDocumentToDrive === 'function') window.saveGeneratedDocumentToDrive(base + '.html', 'text/html', html, { category: category }).catch(function () {});
        }
        close();
    }
    function handleUpload(input, file) {
        chooseProfile(input, file, { allowNoProfile: true }).then(function (choice) {
            if (!choice || choice.cancelled) return;
            extractForUpload(input, file, choice);
        });
    }
    function discover(root) {
        var container = root || document, inputs = [];
        if (container.matches && container.matches('input[type="file"]')) inputs.push(container);
        Array.prototype.push.apply(inputs, container.querySelectorAll('input[type="file"]'));
        inputs.forEach(function (input) {
            if (input.id === 'v2-rfp-intake-file' || input.dataset.aiPromptsBound || input.closest('#' + ROOT_ID)) return;
            input.dataset.aiPromptsBound = 'true';
            var button = document.createElement('button');
            button.type = 'button'; button.className = 'ai-upload-prompts-button'; button.textContent = 'AI Prompts';
            button.setAttribute('aria-label', 'Open AI prompt catalog for ' + titleFor(input));
            button.onclick = function () { renderCatalog(defaultArea(input), input); };
            input.insertAdjacentElement('afterend', button);
            input.addEventListener('change', function () { if (input.files && input.files.length) handleUpload(input, input.files[0]); }, true);
        });
    }
    window.AIUploadPrompts = {
        snapshot: function () { return { schemaVersion: SCHEMA_VERSION, profiles: clone(profiles) }; },
        hydrate: function (state) {
            var incoming = state && state.profiles ? state.profiles : state;
            profiles = migrateSaved(incoming || {}, false);
            saveProfiles(); discover(); return window.AIUploadPrompts.snapshot();
        },
        createProfile: function (profile, area) { return createProfile(profile, area); },
        updateProfile: function (id, changes) { return updateProfile(id, changes); },
        restoreProfileVersion: function (id, version) { return restoreProfileVersion(id, version); },
        compareProfileVersion: function (id, version) { return compareProfileVersion(id, version); },
        duplicateProfile: function (id) { return duplicateProfile(id); },
        setProfileActive: function (id, active) { return setProfileActive(id, active); },
        setProfileDefault: function (id) { return setProfileDefault(id); },
        deleteProfile: function (id) { return deleteProfile(id); },
        defaultProfile: function (selection) {
            selection = selection || {};
            return clone(defaultProfile(selection.input || null, selection.documentType, selection.uploadArea));
        },
        discover: discover,
        catalog: function (input, area) { renderCatalog(area || defaultArea(input), input); },
        classify: function (file, options) { return chooseProfile(options && options.input || null, file, options || {}); },
        promptOptions: function (selection) {
            var p = selection && selection.profile;
            return p ? { profileId: p.id, profileVersion: p.version, documentType: p.documentType, steps: p.steps.slice(), destination: p.destinationRules || p.destination, allowedFields: p.allowedFields.slice(), examples: p.examples } : {};
        },
        recordExternalReview: function (payload) { if (payload) audit('External extraction review recorded', JSON.stringify(payload)); }
    };
    window.dispatchEvent(new Event('stop-loss-ai-prompts-ready'));
    discover();
    new MutationObserver(function (records) {
        records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1) discover(node); }); });
    }).observe(document.documentElement, { childList: true, subtree: true });
})();