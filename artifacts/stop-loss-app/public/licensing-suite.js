// Producer Licensing Suite
(function() {
    // State
    let data = {
        brokerages: [],
        agents: [],
        stateLicenses: [],
        niprAppointments: [],
        documents: [],
        documentTemplates: [],
        notes: [],
        communicationCadence: [],
        communicationLog: [],
        auditLogs: [],
        licensingRules: null,
        appointmentEvaluations: [],
        appointmentWorkItems: [],
        appointmentOutbox: [],
        appointmentLedger: [],
        licensingMode: 'simulation',
        regulatoryTransport: null
    };

    const LS_KEY = 'tinubu_licensing_suite';
    let stateVersion = Number(window.STOP_LOSS_LICENSING_VERSION) || null;
    let persistTimer = null;
    let initialized = false;
    let persistInFlight = false;
    let stateRevision = 0;
    const licensingRules = function () { return window.TinubuLicensingRules || {}; };
    const LICENSING_REASON_CODES = function () {
        return licensingRules().reasonCodes || {
            INVALID_EFFECTIVE_DATE: 'INVALID_EFFECTIVE_DATE',
            UNSUPPORTED_STATE: 'UNSUPPORTED_STATE',
            BROKERAGE_NOT_FOUND: 'BROKERAGE_NOT_FOUND',
            BROKERAGE_INACTIVE: 'BROKERAGE_INACTIVE',
            BROKERAGE_INVALID_DATES: 'BROKERAGE_INVALID_DATES',
            BROKERAGE_NOT_YET_EFFECTIVE: 'BROKERAGE_NOT_YET_EFFECTIVE',
            BROKERAGE_EXPIRED: 'BROKERAGE_EXPIRED',
            BROKERAGE_STATE_UNAUTHORIZED: 'BROKERAGE_STATE_UNAUTHORIZED',
            BROKERAGE_AH_AUTHORITY_MISSING: 'BROKERAGE_AH_AUTHORITY_MISSING',
            BROKERAGE_CLASSIFICATION_INVALID: 'BROKERAGE_CLASSIFICATION_INVALID',
            AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
            AGENT_INACTIVE: 'AGENT_INACTIVE',
            AGENT_INVALID_DATES: 'AGENT_INVALID_DATES',
            AGENT_NOT_YET_EFFECTIVE: 'AGENT_NOT_YET_EFFECTIVE',
            AGENT_EXPIRED: 'AGENT_EXPIRED',
            AGENT_AH_AUTHORITY_MISSING: 'AGENT_AH_AUTHORITY_MISSING',
            AGENT_CLASSIFICATION_INVALID: 'AGENT_CLASSIFICATION_INVALID',
            AGENT_LICENSE_MISSING: 'AGENT_LICENSE_MISSING',
            AGENT_LICENSE_INACTIVE: 'AGENT_LICENSE_INACTIVE',
            AGENT_LICENSE_INVALID_DATES: 'AGENT_LICENSE_INVALID_DATES',
            AGENT_LICENSE_NOT_YET_EFFECTIVE: 'AGENT_LICENSE_NOT_YET_EFFECTIVE',
            AGENT_LICENSE_EXPIRED: 'AGENT_LICENSE_EXPIRED',
            APPOINTMENT_ADVISORY: 'APPOINTMENT_ADVISORY'
        };
    };
    // Sheet and local-storage values are untrusted: use this for every value
    // placed into generated markup (including form attributes).
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function safeActionId(value) {
        const id = String(value == null ? '' : value);
        return /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
    }
    function canonicalDate(value) {
        if (value == null || String(value).trim() === '') return '';
        const raw = String(value).trim();
        let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            match = usMatch ? [null, usMatch[3], usMatch[1], usMatch[2]] : null;
        }
        if (!match) return '';
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function normalizeState() {
        data.licensingRules = data.licensingRules || licensingRules();

        // Normalize stateLicenses effective/expiration/status
        data.stateLicenses = (data.stateLicenses || []).map(l => ({
            ...l,
            state: String(l.state || '').trim().toUpperCase(),
            effectiveDate: canonicalDate(l.effectiveDate || l.effDate || l.effective),
            expirationDate: canonicalDate(l.expirationDate || l.expDate || l.expiration),
            status: l.status || (l.active ? 'Active' : 'Expired')
        }));
        
        // Normalize brokerages dates & commissions
        data.brokerages = (data.brokerages || []).map(b => ({
            ...b,
            effectiveDate: canonicalDate(b.effectiveDate || b.effDate || b.effective),
            expirationDate: canonicalDate(b.expirationDate || b.expDate || b.expiration),
            states: Array.isArray(b.states) ? b.states : String(b.states || '').split(/[,;|/]/).map(s => s.trim().toUpperCase()).filter(Boolean),
            entityClassification: b.entityClassification || 'entity',
            ahAuthority: b.ahAuthority || b.lineOfAuthority || b.licenses || '',
            commissionMin: b.commissionMin !== undefined ? b.commissionMin : 0,
            commissionDefault: b.commissionDefault !== undefined ? b.commissionDefault : 10,
            commissionMax: b.commissionMax !== undefined ? b.commissionMax : 20
        }));
        data.agents = (data.agents || []).map(a => {
            let brokerage = data.brokerages.find(b => b.id === a.brokerageId || b.name === a.brokerage);
            return {
                ...a,
                brokerageId: brokerage ? brokerage.id : (a.brokerageId || ''),
                licenseNumber: a.licenseNumber || a.licenseNo || '',
                individualClassification: a.individualClassification || 'individual',
                ahAuthority: a.ahAuthority || a.lineOfAuthority || a.loa || '',
                effectiveDate: canonicalDate(a.effectiveDate || a.effDate || a.effective),
                expirationDate: canonicalDate(a.expirationDate || a.expDate || a.expiration)
            };
        });

        data.appointmentEvaluations = Array.isArray(data.appointmentEvaluations) ? data.appointmentEvaluations : [];
        data.appointmentWorkItems = Array.isArray(data.appointmentWorkItems) ? data.appointmentWorkItems : [];
        data.appointmentOutbox = Array.isArray(data.appointmentOutbox) ? data.appointmentOutbox : [];
        data.appointmentLedger = Array.isArray(data.appointmentLedger) ? data.appointmentLedger : [];
        data.licensingMode = data.licensingMode === 'live' ? 'live' : 'simulation';
        data.regulatoryTransport = data.regulatoryTransport && typeof data.regulatoryTransport === 'object'
            ? data.regulatoryTransport
            : { provider: null, configured: false, authorized: false, healthy: false, ready: false, status: 'NOT_CONFIGURED' };
        data.brokerages = data.brokerages.map(b => ({
            ...b,
            npn: b.npn || b.nationalProducerNumber || '',
            verificationSource: b.verificationSource || b.verifiedSource || b.source || 'Operator-maintained',
            lastVerifiedAt: b.lastVerifiedAt || b.lastVerified || '',
            exceptions: Array.isArray(b.exceptions) ? b.exceptions : (b.exception ? [b.exception] : []),
            carrierAppointments: Array.isArray(b.carrierAppointments) ? b.carrierAppointments : [],
            linkedQuotes: Array.isArray(b.linkedQuotes) ? b.linkedQuotes : [],
            linkedPolicies: Array.isArray(b.linkedPolicies) ? b.linkedPolicies : []
        }));
        data.agents = data.agents.map(a => ({
            ...a,
            npn: a.npn || a.nationalProducerNumber || '',
            verificationSource: a.verificationSource || a.verifiedSource || a.source || 'Operator-maintained',
            lastVerifiedAt: a.lastVerifiedAt || a.lastVerified || '',
            exceptions: Array.isArray(a.exceptions) ? a.exceptions : (a.exception ? [a.exception] : []),
            carrierAppointments: Array.isArray(a.carrierAppointments) ? a.carrierAppointments : [],
            linkedQuotes: Array.isArray(a.linkedQuotes) ? a.linkedQuotes : [],
            linkedPolicies: Array.isArray(a.linkedPolicies) ? a.linkedPolicies : []
        }));

    }

    async function loadState() {
        try {
            const apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/state') : '/api/licensing/state';
            const response = await (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/state', { credentials: 'include' }) : fetch(apiUrl, { credentials: 'include' }));
            const payload = await response.json();
            if (!response.ok) {
                const error = new Error(payload && payload.error || 'Unable to retrieve the current licensing state.');
                error.status = response.status;
                throw error;
            }
            data = payload.state;
            window.__tinubuLicensingAuthoritative = true;
            stateVersion = payload.version;
            normalizeState();
            saveState(false);
            return true;
        } catch (e) {
            // A cache is only an offline fallback; it is never authoritative.
            try {
                const saved = localStorage.getItem(LS_KEY);
                if (!saved) throw e;
                window.__tinubuLicensingAuthoritative = false;
                data = JSON.parse(saved);
                normalizeState();
                if (e && (e.status === 401 || e.status === 403 || /Unauthorized|approval|allowlist/i.test(e.message || ''))) {
                    console.warn('Using cached Producer Licensing data; protected changes require an API session.');
                } else {
                    setTimeout(() => lsAlert('Working offline from a cached licensing state. Changes will save when the secure workspace is available.'), 500);
                }
                return true;
            } catch (_) {
                if (e && (e.status === 401 || e.status === 403 || /Unauthorized|approval|allowlist/i.test(e.message || ''))) {
                    console.warn('Protected Producer Licensing data is unavailable without an API session.');
                } else {
                    console.error('Failed to load Licensing state', e);
                    setTimeout(() => lsAlert('<span style="color:var(--tinubu-danger)">The current Producer Licensing state could not be loaded.</span>'), 500);
                }
                return false;
            }
        } finally {
            window.dispatchEvent(new Event('stop-loss-licensing-state-ready'));
        }
    }

    async function refreshCanonicalState(conflict) {
        const apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/state') : '/api/licensing/state';
        const response = await (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/state', { credentials: 'include' }) : fetch(apiUrl, { credentials: 'include' }));
        const payload = await response.json();
        if (!response.ok) throw new Error(payload && payload.error || 'Unable to refresh licensing state.');
        data = payload.state;
        stateVersion = payload.version;
        stateRevision = 0;
        normalizeState();
        saveState(false);
        syncCRM();
        if (conflict) lsAlert('Another user saved licensing changes first. The current server state has been reloaded; please reapply your changes.');
    }

    function saveState(persist = true) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(data));
        } catch (e) { console.error('Failed to save Licensing state', e); }
        window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'licensing' } }));
        if (!persist || !initialized || !stateVersion) return;
        stateRevision += 1;
        clearTimeout(persistTimer);
        persistTimer = setTimeout(persistState, 500);
    }

    async function persistState() {
        if (persistInFlight) return;
        if (!stateVersion) return;
        persistInFlight = true;
        const revisionAtRequest = stateRevision;
        const stateAtRequest = JSON.parse(JSON.stringify(data));
        let saved = false;
        try {
            const apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/state') : '/api/licensing/state';
            const response = await (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/state', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: stateVersion, state: stateAtRequest })
            }) : fetch(apiUrl, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: stateVersion, state: stateAtRequest })
            }));
            const payload = await response.json();
            if (response.status === 409) {
                await refreshCanonicalState(true);
                return;
            }
            if (!response.ok) throw new Error(payload && payload.error || 'Unable to save licensing state.');
            // Do not overwrite edits made while this request was in flight.
            stateVersion = payload.version;
            saved = true;
            if (stateRevision === revisionAtRequest) {
                data = payload.state;
                normalizeState();
                saveState(false);
            }
        } catch (e) {
            console.error('Failed to persist Licensing state', e);
            lsAlert('Licensing changes are cached locally but could not be saved to the secure workspace.');
        } finally {
            persistInFlight = false;
            if (saved && window.StopLossCloud && typeof window.StopLossCloud.sync === 'function') {
                window.StopLossCloud.sync({ silent: true, backupOnFailure: true }).catch(function () {});
            }
            // A newer edit uses the version returned above and is serialized
            // after this request, avoiding self-inflicted version conflicts.
            if (saved && stateRevision > revisionAtRequest) {
                clearTimeout(persistTimer);
                persistTimer = setTimeout(persistState, 0);
            }
        }
    }

    function redactAuditValue(value, key = '') {
        const sensitive = /email|phone|ein|npn|license(number)?|ssn|token|secret|password|credential/i.test(key);
        if (sensitive && value != null && typeof value !== 'object') {
            const raw = String(value);
            return raw.length <= 4 ? '••••' : '••••' + raw.slice(-4);
        }
        if (Array.isArray(value)) return value.map(item => redactAuditValue(item, key));
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactAuditValue(childValue, childKey)]));
        }
        return value;
    }
    function redactAuditText(value) {
        if (value && typeof value === 'object') return JSON.stringify(redactAuditValue(value));
        const raw = String(value == null ? '' : value);
        try { return JSON.stringify(redactAuditValue(JSON.parse(raw))); } catch (_) { return raw; }
    }
    function logAudit(action, details, entityId = null, before = null, after = null, metadata = {}) {
        const operationId = metadata.operationId || metadata.correlationId || generateId('OP');
        const safeMetadata = redactAuditValue({
            source: metadata.source || 'Producer Licensing workspace',
            mode: metadata.mode || data.licensingMode || 'simulation',
            direction: metadata.direction || 'internal',
            eventType: metadata.eventType || action,
            status: metadata.status || 'Completed',
            jurisdiction: metadata.jurisdiction || metadata.state || null,
            operationId,
            correlationId: metadata.correlationId || operationId,
            entityLinks: metadata.entityLinks || (entityId ? { entityId } : {}),
            ...(metadata || {})
        });
        let entry = {
            id: 'A-' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            action: action,
            details: redactAuditText(details),
            entityId: entityId,
            before: before ? redactAuditValue(JSON.parse(JSON.stringify(before))) : null,
            after: after ? redactAuditValue(JSON.parse(JSON.stringify(after))) : null,
            category: 'Licensing & DOI',
            eventType: safeMetadata.eventType,
            status: safeMetadata.status,
            source: safeMetadata.source,
            mode: safeMetadata.mode,
            direction: safeMetadata.direction,
            operationId,
            correlationId: safeMetadata.correlationId,
            jurisdiction: safeMetadata.jurisdiction,
            entityLinks: safeMetadata.entityLinks,
            metadata: safeMetadata
        };
        data.auditLogs.unshift(entry);
        if (data.auditLogs.length > 500) data.auditLogs.pop();
        
        // Append to global TINUBU.audit
        window.TINUBU = window.TINUBU || {};
        window.TINUBU.audit = window.TINUBU.audit || [];
        window.TINUBU.audit.push(entry);
        if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordLicensingEvent === 'function') {
            window.TinubuSystemLog.recordLicensingEvent(entry);
        }
        window.dispatchEvent(new CustomEvent('tinubu:licensing-event', { detail: entry }));

        saveState();
    }

    // CRM Sync: Push our data out to CRMX and TINUBU objects
    function syncCRM() {
        window.CRMX = window.CRMX || {};
        window.CRMX.relationships = window.CRMX.relationships || window.CRMX.accounts || [];
        
        window.TINUBU = window.TINUBU || {};
        window.TINUBU.contacts = window.TINUBU.contacts || [];

        // Sync brokerages as CRMX.relationships
        data.brokerages.forEach(b => {
            let existing = window.CRMX.relationships.find(r => r.id === b.id);
            let relationshipValues = {
                name: b.name,
                type: 'Broker',
                status: b.status,
                brokerNumber: b.brokerNumber || b.brokerCode || '',
                brokerCode: b.brokerCode || b.brokerNumber || '',
                licenseNumber: b.licenseNumber || '',
                states: (b.states || []).slice(),
                effectiveDate: b.effectiveDate,
                expirationDate: b.expirationDate,
                commissionMin: b.commissionMin,
                commissionDefault: b.commissionDefault,
                commissionMax: b.commissionMax
            };
            if (existing) {
                Object.assign(existing, relationshipValues);
            } else {
                window.CRMX.relationships.push(Object.assign({ id: b.id }, relationshipValues));
            }
            (b.contacts || []).forEach((contact, index) => {
                let contactId = b.id + '-CONTACT-' + (index + 1);
                let savedContact = window.TINUBU.contacts.find(c => c.id === contactId);
                let values = { name: contact.name, email: contact.email, phone: contact.phone, role: contact.type, type: 'Broker', status: 'Active', relationshipId: b.id };
                if (savedContact) Object.assign(savedContact, values);
                else window.TINUBU.contacts.push(Object.assign({ id: contactId }, values));
            });
        });

        // Sync agents as TINUBU.contacts
        data.agents.forEach(a => {
            let existing = window.TINUBU.contacts.find(c => c.id === a.id);
            if (existing) {
                existing.name = a.name;
                existing.email = a.email;
                existing.licenseNumber = a.licenseNumber || '';
                existing.agentLicenseNumber = a.licenseNumber || '';
                existing.relationshipId = a.brokerageId;
            } else {
                window.TINUBU.contacts.push({ id: a.id, name: a.name, email: a.email, licenseNumber: a.licenseNumber || '', agentLicenseNumber: a.licenseNumber || '', relationshipId: a.brokerageId });
            }
        });
    }

    function generateId(prefix) {
        return prefix + '-' + Math.floor(Math.random() * 1000000);
    }

    function injectUI() {
        const portalSwitcher = document.querySelector('.portal-switcher');
        if (!portalSwitcher) return;

        if (!document.getElementById('btn-portal-licensing')) {
            const btn = document.createElement('button');
            btn.className = 'portal-btn';
            btn.id = 'btn-portal-licensing';
            btn.onclick = (e) => {
                if(window.switchPortal) window.switchPortal('view-licensing', btn);
                renderDashboard();
            };
            btn.innerHTML = '<i class="fa-solid fa-id-card"></i> Producer Licensing';
            portalSwitcher.appendChild(btn);
        }

        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return;

        if (!document.getElementById('view-licensing')) {
            const view = document.createElement('div');
            view.className = 'portal-view';
            view.id = 'view-licensing';
            
            view.innerHTML = `
                <div class="ls-view-container">
                    <div class="ls-sidebar">
                        <div class="brand-header">
                            <div style="font-weight: 800; color: var(--tinubu-teal-light, #2CB5C9); font-size: 18px;">LICENSING</div>
                            <div style="font-size: 10px; color: #94A3B8; text-transform: uppercase;">Operations & Compliance</div>
                        </div>
                        <div class="nav-group-title">Menu</div>
                        <a class="nav-item active" onclick="LicensingSuite._switchTab('dashboard', this)"><i class="fa-solid fa-chart-line"></i> Dashboard</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('brokerages', this)"><i class="fa-solid fa-building-user"></i> Brokerages</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('agents', this)"><i class="fa-solid fa-user-shield"></i> Agents & Licenses</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('comms', this)"><i class="fa-solid fa-paper-plane"></i> Cadence & Emails</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('nipr', this)"><i class="fa-solid fa-bolt"></i> NIPR Appointments</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('docs', this)"><i class="fa-solid fa-folder-open"></i> Global Documents</a>
                        <a class="nav-item" onclick="LicensingSuite._switchTab('settings', this)"><i class="fa-solid fa-gear"></i> Settings & Audit</a>
                    </div>
                    <div class="ls-main-content">
                        <div class="ls-header">
                            <h2 class="card-title" id="ls-page-title" style="margin:0;"><i class="fa-solid fa-chart-line"></i> Dashboard</h2>
                            <div style="display:flex; gap: 8px;" id="ls-header-actions"></div>
                        </div>
                        <div class="ls-content-body" id="ls-content-body"></div>
                    </div>
                </div>
            `;
            appContainer.appendChild(view);
        }
    }

    // Generic Alerts
    window.lsAlert = function(msg) {
        let el = document.getElementById('ls-alert-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ls-alert-overlay';
            el.className = 'modal-overlay';
            el.style.zIndex = '10000';
            document.body.appendChild(el);
        }
        el.innerHTML = `
            <div class="modal-content" style="width: 400px; max-width: 95vw;">
                <div class="modal-header">
                    <h3 style="margin:0; font-size:14px;"><i class="fa-solid fa-circle-exclamation"></i> Notice</h3>
                    <button class="modal-close" onclick="document.getElementById('ls-alert-overlay').style.display='none'">&times;</button>
                </div>
                <div class="modal-body"><div style="padding:10px 0;">${msg}</div></div>
                <div class="modal-footer">
                    <button class="btn btn-navy" onclick="document.getElementById('ls-alert-overlay').style.display='none'">OK</button>
                </div>
            </div>
        `;
        el.style.display = 'flex';
    };

    // Modal Builder
    function showModal(title, bodyHtml, footerHtml, width = '600px') {
        let overlay = document.getElementById('ls-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ls-modal-overlay';
            overlay.className = 'modal-overlay';
            overlay.style.zIndex = '9999';
            document.body.appendChild(overlay);
        }
        
        overlay.innerHTML = `
            <div class="modal-content" style="width: ${width}; max-width: 95vw;">
                <div class="modal-header">
                    <h3 style="margin:0; font-size:14px;"><i class="fa-solid fa-id-card"></i> ${escapeHtml(title)}</h3>
                    <button class="modal-close" onclick="document.getElementById('ls-modal-overlay').style.display='none'">&times;</button>
                </div>
                <div class="modal-body">${bodyHtml}</div>
                ${footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : ''}
            </div>
        `;
        overlay.style.display = 'flex';
    }

    function closeModal() {
        let overlay = document.getElementById('ls-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    window.LicensingSuite = {
        render: function() {
            if(window.switchPortal) {
                const btn = document.getElementById('btn-portal-licensing');
                window.switchPortal('view-licensing', btn);
            }
            renderDashboard();
        },
        open: function() { this.render(); },
        
        validateSelection: function({ brokerageName, agentName, state, effectiveDate, brokerageId, agentId, appointmentStatus, lineOfAuthority }) {
            const codes = LICENSING_REASON_CODES();
            const selectedState = String(state || '').trim().toUpperCase();
            const targetDate = canonicalDate(effectiveDate);
            const targetTs = Date.parse((targetDate || '') + 'T00:00:00Z');
            const rules = licensingRules().getRules ? licensingRules().getRules(selectedState) : {};
            const failure = (code, reason, evidence) => ({
                valid: false, hardBlock: true, code, reasonCode: code, reason,
                reasons: [{ code, message: reason, severity: 'error' }], advisory: [],
                evidence: Object.assign({ state: selectedState, effectiveDate: targetDate || effectiveDate || null }, evidence || {})
            });
            const dateFailure = (record, prefix) => {
                if (String(record.status || '').toLowerCase() !== 'active') return failure(codes[prefix + '_INACTIVE'], prefix + ' authority is inactive.', { recordId: record.id || null });
                const start = Date.parse((record.effectiveDate || '') + 'T00:00:00Z');
                const end = Date.parse((record.expirationDate || '') + 'T00:00:00Z');
                if (!Number.isFinite(start) || !Number.isFinite(end)) return failure(codes[prefix + '_INVALID_DATES'], prefix + ' authority has invalid effective or expiration dates.', { recordId: record.id || null });
                if (start > targetTs) return failure(codes[prefix + '_NOT_YET_EFFECTIVE'], prefix + ' authority is not effective for the policy date.', { recordId: record.id || null });
                if (end < targetTs) return failure(codes[prefix + '_EXPIRED'], prefix + ' authority is expired for the policy date.', { recordId: record.id || null });
                return null;
            };
            if (!targetDate || !Number.isFinite(targetTs)) return failure(codes.INVALID_EFFECTIVE_DATE, 'The policy effective date is invalid. Use YYYY-MM-DD or MM/DD/YYYY.');
            if (!rules.individual || !rules.appointment) return failure(codes.UNSUPPORTED_STATE, `A&H licensing rules are not available for ${selectedState}.`);
            const brokerage = data.brokerages.find(b => (brokerageId && String(b.id) === String(brokerageId)) || String(b.name || '').toLowerCase() === String(brokerageName || '').trim().toLowerCase());
            if (!brokerage) return failure(codes.BROKERAGE_NOT_FOUND, 'Brokerage authority was not found.');
            const brokerageDateFailure = dateFailure(brokerage, 'BROKERAGE');
            if (brokerageDateFailure) return brokerageDateFailure;
            if (brokerage.entityClassification && brokerage.entityClassification !== 'entity') return failure(codes.BROKERAGE_CLASSIFICATION_INVALID, 'The selected brokerage record is not classified as an entity authority.', { brokerageId: brokerage.id, brokerageName: brokerage.name });
            if (!(brokerage.states || []).map(s => String(s).toUpperCase()).includes(selectedState)) return failure(codes.BROKERAGE_STATE_UNAUTHORIZED, `Brokerage is not authorized in ${selectedState}.`, { brokerageId: brokerage.id, brokerageName: brokerage.name });
            if (rules.entity && !(licensingRules().hasAhAuthority ? licensingRules().hasAhAuthority(brokerage.ahAuthority || brokerage.lineOfAuthority || brokerage.licenses, rules.entity.licenseType) : true)) return failure(codes.BROKERAGE_AH_AUTHORITY_MISSING, `Brokerage does not show Accident & Health authority required in ${selectedState}.`, { brokerageId: brokerage.id, brokerageName: brokerage.name, entityRuleId: rules.entity.id });
            const agent = data.agents.find(a => (agentId && String(a.id) === String(agentId) || String(a.name || '').toLowerCase() === String(agentName || '').trim().toLowerCase()) && (!a.brokerageId || a.brokerageId === brokerage.id));
            if (!agent) return failure(codes.AGENT_NOT_FOUND, 'Agent authority was not found for this brokerage.', { brokerageId: brokerage.id, brokerageName: brokerage.name });
            const agentDateFailure = dateFailure(agent, 'AGENT');
            if (agentDateFailure) return agentDateFailure;
            if (agent.individualClassification && agent.individualClassification !== 'individual') return failure(codes.AGENT_CLASSIFICATION_INVALID, 'The selected agent record is not classified as an individual producer.', { agentId: agent.id, agentName: agent.name });
            if (!(licensingRules().hasAhAuthority ? licensingRules().hasAhAuthority(agent.ahAuthority || agent.lineOfAuthority || agent.loa || lineOfAuthority, rules.individual.licenseType) : true)) return failure(codes.AGENT_AH_AUTHORITY_MISSING, `Agent does not show Accident & Health authority required in ${selectedState}.`, { agentId: agent.id, agentName: agent.name, individualRuleId: rules.individual.id });
            const existing = data.stateLicenses.find(l => l.agentId === agent.id && l.state === selectedState);
            if (!existing) return failure(codes.AGENT_LICENSE_MISSING, `Agent does not have an A&H license in ${selectedState}.`, { agentId: agent.id, agentName: agent.name });
            if (!(licensingRules().hasAhAuthority ? licensingRules().hasAhAuthority(existing.lineOfAuthority || existing.loa || existing.type, rules.individual.licenseType) : true)) return failure(codes.AGENT_AH_AUTHORITY_MISSING, 'Agent state license does not include the required A&H line of authority.', { agentLicenseId: existing.id, individualRuleId: rules.individual.id });
            const licenseDateFailure = dateFailure(existing, 'AGENT_LICENSE');
            if (licenseDateFailure) return licenseDateFailure;
            const appointment = licensingRules().evaluateAppointment ? licensingRules().evaluateAppointment(selectedState, appointmentStatus || (data.niprAppointments || []).find(n => n.agentId === agent.id && n.state === selectedState)?.status, 'individual') : { rule: null, advisory: null };
            const evidence = { state: selectedState, effectiveDate: targetDate, brokerageId: brokerage.id, brokerageName: brokerage.name, agentId: agent.id, agentName: agent.name, agentLicenseId: existing.id, entityRuleId: rules.entity && rules.entity.id || null, individualRuleId: rules.individual.id, appointmentRuleId: rules.appointment.id };
            return { valid: true, hardBlock: false, code: appointment.advisory ? 'VALID_WITH_APPOINTMENT_ADVISORY' : 'VALID', reasonCode: appointment.advisory ? 'VALID_WITH_APPOINTMENT_ADVISORY' : 'VALID', reasons: appointment.advisory ? [appointment.advisory] : [], advisory: appointment.advisory ? [appointment.advisory] : [], appointment: appointment.rule, evidence };
        },

        validateCurrentQuote: function() {
            if (!window.quoteExtracted || !window.quoteExtracted.rfp) return { valid: true };
            let rfp = window.quoteExtracted.rfp;
            
            let brokerName = rfp.broker || rfp.brokerOrg;
            let agentName = rfp.producer || rfp.agent;
            let state = rfp.state || rfp.situsState || 'PA';
            let effectiveDate = rfp.effective || rfp.effectiveDate || new Date().toISOString().split('T')[0];
            
            if (!brokerName || !agentName) return { valid: true };
            
            return this.validateSelection({ brokerageName: brokerName, agentName: agentName, state, effectiveDate });
        },

        showBlock: function(actionLabel, val) {
            showModal('Licensing Compliance Block', `
                <div style="text-align:center; padding:20px 0;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:40px;color:var(--tinubu-danger,#BE123C);margin-bottom:16px;"></i>
                    <h4 style="font-size:16px;margin-bottom:8px;">Compliance validation failed</h4>
                    <p style="color:var(--tinubu-text-muted,#64748b);margin-bottom:20px;">Cannot proceed with <strong>${escapeHtml(actionLabel)}</strong> until the assigned brokerage and agent have valid authority for the policyholder state and effective date.</p>
                    <div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:6px;padding:12px;color:#9F1239;font-weight:600;text-align:left;font-size:12px;">
                        <strong>${val && val.hardBlock ? 'Hard block' : 'Blocking issue'}:</strong> ${escapeHtml(val && val.reason ? val.reason : 'Licensing validation could not be completed.')}
                    </div>
                </div>
            `, '<button class="btn btn-secondary" onclick="document.getElementById(\'ls-modal-overlay\').style.display=\'none\'">Close</button>');
            logAudit('GUARD_BLOCK', `Blocked ${actionLabel}: ${val && val.reason ? val.reason : 'Unknown licensing issue'}`);
        },

        guard: function(actionLabel, continuation) {
            let val = this.validateCurrentQuote();
            if (val.valid) {
                if (val.advisory && val.advisory.length) {
                    logAudit('LICENSING_EVALUATION', JSON.stringify({ action: actionLabel, reasonCode: val.reasonCode, evidence: val.evidence, advisory: val.advisory }));
                    if (window.showTinubuNotice) window.showTinubuNotice(val.advisory[0].message, false);
                }
                continuation();
            } else {
                this.showBlock(actionLabel, val);
            }
        },
        
        getCommissionDefault: function(brokerageId) {
            let b = data.brokerages.find(x => x.id === brokerageId);
            return b ? b.commissionDefault : 0;
        },
        
        validateCommission: function(brokerageId, value) {
            let b = data.brokerages.find(x => x.id === brokerageId);
            if (!b) return false;
            return value >= b.commissionMin && value <= b.commissionMax;
        },

        recordEvaluation: function(actionLabel, result, selection) {
            if (!result) return;
            data.appointmentEvaluations = Array.isArray(data.appointmentEvaluations) ? data.appointmentEvaluations : [];
            data.appointmentEvaluations.unshift({
                id: generateId('AE'),
                createdAt: new Date().toISOString(),
                actor: appointmentActor(),
                selection: JSON.parse(JSON.stringify(selection || result.evidence || {})),
                result: JSON.parse(JSON.stringify(result)),
                source: /\(server\)/i.test(actionLabel) ? 'Server-authoritative protected licensing validation' : 'Client preflight using the same A&H rules'
            });
            data.appointmentEvaluations = data.appointmentEvaluations.slice(0, 100);
            logAudit('LICENSING_EVALUATION', JSON.stringify({ action: actionLabel, reasonCode: result.reasonCode || result.code || null, evidence: result.evidence || selection || null, advisory: result.advisory || [] }), result.evidence && result.evidence.agentId || null);
        },

        openBrokerage: function(id) {
            this.render();
            this._switchTab('brokerages');
            setTimeout(() => lsEditBrokerage(id), 100);
        },

        openAgent: function(id) {
            this.render();
            this._switchTab('agents');
            setTimeout(() => lsEditAgent(id), 100);
        },

        snapshot: function() {
            return JSON.parse(JSON.stringify(data));
        },
        setOperatingMode: function(mode, readiness) {
            if (mode === 'live' && !(readiness && readiness.ready === true)) return false;
            const next = mode === 'live' ? 'live' : 'simulation';
            if (data.licensingMode === next && JSON.stringify(data.regulatoryTransport || {}) === JSON.stringify(readiness || data.regulatoryTransport || {})) return true;
            const previous = data.licensingMode;
            data.licensingMode = next;
            data.regulatoryTransport = readiness ? JSON.parse(JSON.stringify(readiness)) : data.regulatoryTransport;
            logAudit('LICENSING_MODE_PERSISTED', { from: previous, to: next }, null, null, null, {
                operationId: 'MODE-' + next.toUpperCase(),
                correlationId: 'MODE-' + next.toUpperCase(),
                status: 'Completed',
                source: 'System Log operating-mode control',
                mode: next,
                direction: 'internal'
            });
            return true;
        },

        // Conflict recovery uses an explicit local snapshot so a canonical
        // index refresh cannot silently replace the operator's edit.
        restoreSnapshot: function(state) {
            if (!state || typeof state !== 'object') return false;
            data = JSON.parse(JSON.stringify(state));
            normalizeState();
            saveState(false);
            syncCRM();
            let view = document.getElementById('view-licensing');
            if(view && view.classList.contains('active')) {
                renderDashboard();
            }
            return true;
        },

        hydrate: function(state) {
            const localAudit = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data = JSON.parse(JSON.stringify(state));
            normalizeState();
            const seenAudit = new Set(data.auditLogs.map(item => item.id));
            localAudit.forEach(item => { if (!seenAudit.has(item.id)) data.auditLogs.push(item); });
            data.auditLogs.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
            saveState(false);
            syncCRM();
            let view = document.getElementById('view-licensing');
            if(view && view.classList.contains('active')) {
                renderDashboard();
            }
        },
        syncCRM: syncCRM,
        
        _switchTab: function(tab, element) {
            if (element) {
                document.querySelectorAll('.ls-sidebar .nav-item').forEach(el => el.classList.remove('active'));
                element.classList.add('active');
            } else {
                document.querySelectorAll('.ls-sidebar .nav-item').forEach(el => {
                    el.classList.remove('active');
                    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${tab}'`)) el.classList.add('active');
                });
            }
            
            const titles = {
                'dashboard': '<i class="fa-solid fa-chart-line"></i> Operations Dashboard',
                'brokerages': '<i class="fa-solid fa-building-user"></i> Brokerages Directory',
                'agents': '<i class="fa-solid fa-user-shield"></i> Agents & Licenses',
                'comms': '<i class="fa-solid fa-paper-plane"></i> Renewal Cadence & Comms',
                'nipr': '<i class="fa-solid fa-bolt"></i> NIPR Appointments Sync',
                'docs': '<i class="fa-solid fa-folder-open"></i> Global Compliance Documents',
                'settings': '<i class="fa-solid fa-gear"></i> Settings & Audit Logs'
            };
            
            document.getElementById('ls-page-title').innerHTML = titles[tab] || titles['dashboard'];
            document.getElementById('ls-header-actions').innerHTML = '';
            
            if (tab === 'dashboard') renderDashboard();
            if (tab === 'brokerages') renderBrokerages();
            if (tab === 'agents') renderAgents();
            if (tab === 'comms') renderComms();
            if (tab === 'nipr') renderNipr();
            if (tab === 'docs') renderDocs();
            if (tab === 'settings') renderSettings();
        }
    };

    // ----------------------------------------------------
    // UI RENDERERS
    // ----------------------------------------------------

    function setContent(html) { document.getElementById('ls-content-body').innerHTML = html; }
    function setActions(html) { document.getElementById('ls-header-actions').innerHTML = html; }

    function renderDashboard() {
        let actBrokerages = data.brokerages.filter(b => b.status === 'Active').length;
        let actAgents = data.agents.filter(a => a.status === 'Active').length;
        let exp90 = data.stateLicenses.filter(l => {
            let ms = new Date(l.expirationDate).getTime() - Date.now();
            return ms > 0 && ms <= 90 * 24 * 3600 * 1000;
        }).length;
        let expired = data.stateLicenses.filter(l => new Date(l.expirationDate).getTime() < Date.now()).length;

        setContent(`
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-title">Active Brokerages</div>
                    <div class="kpi-value">${actBrokerages} <i class="fa-solid fa-building" style="font-size:16px; color:#cbd5e1; float:right;"></i></div>
                    <div class="kpi-sub" style="color:var(--tinubu-text-muted)">Out of ${data.brokerages.length} total</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-title">Licensed Agents</div>
                    <div class="kpi-value">${actAgents} <i class="fa-solid fa-users" style="font-size:16px; color:#cbd5e1; float:right;"></i></div>
                    <div class="kpi-sub" style="color:var(--tinubu-text-muted)">Out of ${data.agents.length} total</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-title">Expiring < 90 Days</div>
                    <div class="kpi-value">${exp90} <i class="fa-solid fa-clock-rotate-left" style="font-size:16px; color:#cbd5e1; float:right;"></i></div>
                    <div class="kpi-sub" style="color:var(--tinubu-warning, #B45309)">Needs attention</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-title">Expired Licenses</div>
                    <div class="kpi-value">${expired} <i class="fa-solid fa-circle-exclamation" style="font-size:16px; color:#cbd5e1; float:right;"></i></div>
                    <div class="kpi-sub" style="color:var(--tinubu-danger, #BE123C)">Action required</div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <div class="card-title">Recent Audit Logs</div>
                </div>
                <div class="card-body" style="padding: 0;">
                    <table class="data-table">
                        <thead><tr><th>Timestamp</th><th>Action</th><th>Entity ID</th><th>Details</th></tr></thead>
                        <tbody>
                            ${data.auditLogs.slice(0, 5).map(a => `
                                <tr>
                                    <td style="white-space:nowrap; width:150px;">${escapeHtml(new Date(a.timestamp).toLocaleString())}</td>
                                    <td style="font-weight:bold; width:180px;">${escapeHtml(a.action)}</td>
                                    <td>${escapeHtml(a.entityId || '-')}</td>
                                    <td>${escapeHtml(a.details)}</td>
                                </tr>
                            `).join('')}
                            ${data.auditLogs.length === 0 ? '<tr><td colspan="4" style="text-align:center;">No recent activity</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    }

    window.lsRenderBrokerages = renderBrokerages;
    window.lsEditBrokerage = editBrokerage;
    window.lsSaveBrokerage = saveBrokerage;

    function entityComplianceSummary(kind, record) {
        const isAgency = kind === 'agency';
        const producers = isAgency ? data.agents.filter(item => item.brokerageId === record.id || item.brokerage === record.name) : [record];
        const producerIds = producers.map(item => item.id);
        const appointments = (data.niprAppointments || []).filter(item => producerIds.includes(item.agentId) || item.brokerageId === record.id);
        const workItems = (data.appointmentWorkItems || []).filter(item => producerIds.includes(item.producerId) || item.brokerageId === record.id);
        const evaluations = (data.appointmentEvaluations || []).filter(item => {
            const selection = item.selection || {};
            const evidence = item.result && item.result.evidence || {};
            return producerIds.includes(selection.agentId || evidence.agentId) || selection.brokerageId === record.id || evidence.brokerageId === record.id;
        });
        const states = isAgency ? (record.states || []) : data.stateLicenses.filter(item => item.agentId === record.id).map(item => item.state);
        const latest = [record.lastVerifiedAt].concat(
            appointments.map(item => item.lastVerifiedAt || item.verifiedAt || item.date),
            evaluations.map(item => item.createdAt)
        ).filter(Boolean).sort().slice(-1)[0] || '';
        const exceptions = (record.exceptions || []).concat(workItems.filter(item => /BLOCK|REJECT|CANCEL|TERM|FAIL/i.test(item.status || '')).map(item => item.status));
        return { producers, producerIds, appointments, workItems, evaluations, states: Array.from(new Set(states)), latest, exceptions, links: workItems.map(item => item.policyOrQuote).filter(Boolean) };
    }

    function complianceOverviewHtml(kind, record) {
        const summary = entityComplianceSummary(kind, record);
        const activeAppointments = summary.appointments.filter(item => /appointed|active/i.test(item.status || '')).length;
        const pending = summary.workItems.filter(item => !/resolved|cancelled|terminated|not_required/i.test(item.status || '')).length;
        return `
            <section class="ls-compliance-overview" aria-label="${kind === 'agency' ? 'Agency' : 'Producer'} compliance overview">
                <div class="nipr-truth-note"><strong>Shared regulatory record:</strong> Identity and operator-maintained values remain on this record. A&amp;H requirements, filing windows, and appointment evaluations come from the shared NIPR workspace and authoritative rules.</div>
                <div class="nipr-detail-grid">
                    <div><span>NIPR identity</span><strong>${escapeHtml(kind === 'agency' ? (record.npn || record.brokerNumber || record.id) : (record.npn || record.id))}</strong></div>
                    <div><span>Relationship</span><strong>${escapeHtml(kind === 'agency' ? summary.producers.length + ' producer(s)' : (record.brokerage || 'Not assigned'))}</strong></div>
                    <div><span>Jurisdictions</span><strong>${escapeHtml(summary.states.join(', ') || 'None recorded')}</strong></div>
                    <div><span>A&amp;H / LOA</span><strong>${escapeHtml(record.ahAuthority || record.lineOfAuthority || 'Not recorded')}</strong></div>
                    <div><span>Carrier appointments</span><strong>${activeAppointments} active · ${summary.appointments.length} total</strong></div>
                    <div><span>Pending regulatory work</span><strong>${pending}</strong></div>
                    <div><span>Verification source</span><strong>${escapeHtml(record.verificationSource || 'Operator-maintained')}</strong></div>
                    <div><span>Last verified</span><strong>${escapeHtml(summary.latest ? new Date(summary.latest).toLocaleString() : 'Not externally verified')}</strong></div>
                    <div><span>Exceptions</span><strong>${escapeHtml(summary.exceptions.join(', ') || 'None recorded')}</strong></div>
                    <div><span>Linked quote / policy</span><strong>${escapeHtml(Array.from(new Set(summary.links)).join(', ') || 'No linked work item')}</strong></div>
                </div>
            </section>`;
    }

    function renderBrokerages() {
        setActions(`
            <button class="btn btn-navy" onclick="lsEditBrokerage()"><i class="fa-solid fa-plus"></i> Add Brokerage</button>
        `);
        
        setContent(`
            <div class="ls-filters-bar">
                <div class="form-group" style="margin:0; flex:1; min-width:200px;">
                    <input type="text" class="form-control" placeholder="Search brokerages..." onkeyup="lsFilterBrokerages(this.value)">
                </div>
            </div>
            <div class="card">
                <table class="data-table" id="ls-brokerages-table">
                    <thead><tr><th>Agency / NIPR identity</th><th>Relationship</th><th>Jurisdiction &amp; LOA</th><th>Appointment / filing</th><th>Verification</th><th>Status / exceptions</th></tr></thead>
                    <tbody>
                        ${data.brokerages.map(b => {
                            let agentCount = data.agents.filter(a => a.brokerageId === b.id).length;
                            let bStatus = b.status === 'Active' ? 'ls-badge-active' : (b.status === 'Pending' ? 'ls-badge-pending' : 'ls-badge-term');
                            return `
                                <tr class="ls-table-row" onclick="lsEditBrokerage('${safeActionId(b.id)}')">
                                    <td><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.id)} · NPN/code ${escapeHtml(b.npn || b.brokerNumber || b.brokerCode || '—')}</small></td>
                                    <td>${agentCount} producer(s)<small>${escapeHtml(b.type || 'Producer agency')}</small></td>
                                    <td>${escapeHtml((b.states||[]).join(', ') || '—')}<small>${escapeHtml(b.ahAuthority || b.lineOfAuthority || 'LOA not recorded')}</small></td>
                                    <td>${entityComplianceSummary('agency', b).appointments.length} appointment record(s)<small>${entityComplianceSummary('agency', b).workItems.length} work item(s)</small></td>
                                    <td>${escapeHtml(b.verificationSource || 'Operator-maintained')}<small>${escapeHtml(b.lastVerifiedAt ? new Date(b.lastVerifiedAt).toLocaleDateString() : 'Not externally verified')}</small></td>
                                    <td><span class="ls-badge ${bStatus}">${escapeHtml(b.status)}</span><small>${escapeHtml((b.exceptions || []).join(', ') || 'No exception')}</small></td>
                                </tr>
                            `;
                        }).join('')}
                        ${data.brokerages.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No agencies found</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `);
    }

    window.lsFilterBrokerages = function(val) {
        let rows = document.querySelectorAll('#ls-brokerages-table tbody tr');
        let lower = val.toLowerCase();
        rows.forEach(r => {
            if (r.innerText.toLowerCase().includes(lower)) r.style.display = '';
            else r.style.display = 'none';
        });
    }

    function editBrokerage(id) {
        let b = id ? data.brokerages.find(x => x.id === id) : { 
            id: '', name: '', brokerNumber: '', ein: '', type: 'Producer', status: 'Active', states: [],
            effectiveDate: '2024-01-01', expirationDate: '2026-12-31',
            commissionMin: 0, commissionDefault: 10, commissionMax: 20,
            entityClassification: 'entity', ahAuthority: 'Accident & Health'
        };
        let isNew = !id;
        
        let html = `
            ${!isNew ? complianceOverviewHtml('agency', b) : ''}
            <div class="form-grid">
                <div class="form-group">
                    <label>Brokerage Name</label>
                    <input type="text" class="form-control" id="ls-b-name" value="${escapeHtml(b.name)}">
                </div>
                <div class="form-group">
                    <label>Broker Number / Code</label>
                    <input type="text" class="form-control" id="ls-b-number" value="${escapeHtml(b.brokerNumber || b.brokerCode || '')}" placeholder="e.g. 10955">
                </div>
                <div class="form-group">
                    <label>National Producer Number (NPN)</label>
                    <input type="text" inputmode="numeric" class="form-control" id="ls-b-npn" value="${escapeHtml(b.npn || '')}">
                </div>
                <div class="form-group">
                    <label>EIN</label>
                    <input type="text" class="form-control" id="ls-b-ein" value="${escapeHtml(b.ein || '')}">
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select class="form-control" id="ls-b-type">
                        <option value="Producer" ${b.type==='Producer'?'selected':''}>Producer</option>
                        <option value="Sub-Producer" ${b.type==='Sub-Producer'?'selected':''}>Sub-Producer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Entity classification</label>
                    <select class="form-control" id="ls-b-classification">
                        <option value="entity" ${b.entityClassification === 'entity' ? 'selected' : ''}>Entity / brokerage</option>
                        <option value="individual" ${b.entityClassification === 'individual' ? 'selected' : ''}>Individual producer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>A&H authority / LOA</label>
                    <input type="text" class="form-control" id="ls-b-ah-authority" value="${escapeHtml(b.ahAuthority || b.lineOfAuthority || '')}" placeholder="e.g. A&H, Health, Accident">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-control" id="ls-b-status">
                        <option value="Active" ${b.status==='Active'?'selected':''}>Active</option>
                        <option value="Pending" ${b.status==='Pending'?'selected':''}>Pending</option>
                        <option value="Inactive" ${b.status==='Inactive'?'selected':''}>Inactive</option>
                    </select>
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Licensed States (comma separated)</label>
                    <input type="text" class="form-control" id="ls-b-states" value="${escapeHtml((b.states||[]).join(', '))}" placeholder="e.g. PA, NY, FL">
                </div>
                <div class="form-group">
                    <label>Effective Date</label>
                    <input type="date" class="form-control" id="ls-b-eff" value="${escapeHtml(b.effectiveDate)}">
                </div>
                <div class="form-group">
                    <label>Expiration Date</label>
                    <input type="date" class="form-control" id="ls-b-exp" value="${escapeHtml(b.expirationDate)}">
                </div>
            </div>
            
            <h4 style="margin:20px 0 10px; font-size:13px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">Commission Config</h4>
            <div class="form-grid">
                <div class="form-group">
                    <label>Min %</label>
                    <input type="number" step="0.1" class="form-control" id="ls-b-cmin" value="${escapeHtml(b.commissionMin)}">
                </div>
                <div class="form-group">
                    <label>Default %</label>
                    <input type="number" step="0.1" class="form-control" id="ls-b-cdef" value="${escapeHtml(b.commissionDefault)}">
                </div>
                <div class="form-group">
                    <label>Max %</label>
                    <input type="number" step="0.1" class="form-control" id="ls-b-cmax" value="${escapeHtml(b.commissionMax)}">
                </div>
            </div>
        `;
        
        showModal(isNew ? 'New Brokerage' : 'Edit Brokerage: ' + b.name, html, `
            <button class="btn btn-secondary" onclick="document.getElementById('ls-modal-overlay').style.display='none'">Cancel</button>
            <button class="btn btn-primary" onclick="lsSaveBrokerage('${isNew ? '' : safeActionId(b.id)}')">Save Changes</button>
        `, '700px');
    }

    function saveBrokerage(id) {
        let name = document.getElementById('ls-b-name').value;
        if (!name) return lsAlert('Name is required');
        
        let ein = document.getElementById('ls-b-ein').value;
        let brokerNumber = document.getElementById('ls-b-number').value.trim();
        let npn = document.getElementById('ls-b-npn').value.trim();
        let type = document.getElementById('ls-b-type').value;
        let entityClassification = document.getElementById('ls-b-classification').value;
        let ahAuthority = document.getElementById('ls-b-ah-authority').value.trim();
        let status = document.getElementById('ls-b-status').value;
        let statesArr = document.getElementById('ls-b-states').value.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
        let effectiveDate = canonicalDate(document.getElementById('ls-b-eff').value);
        let expirationDate = canonicalDate(document.getElementById('ls-b-exp').value);
        if (!effectiveDate || !expirationDate) return lsAlert('Effective and expiration dates must be valid YYYY-MM-DD dates.');
        if (Date.parse(effectiveDate + 'T00:00:00Z') > Date.parse(expirationDate + 'T00:00:00Z')) return lsAlert('Expiration date must be on or after the effective date.');
        if (statesArr.some(s => !/^[A-Z]{2}$/.test(s) || !(licensingRules().getRules && licensingRules().getRules(s).individual))) return lsAlert('Licensed states must be supported two-letter state codes.');
        if (!ahAuthority) return lsAlert('A&H authority / LOA is required.');
        if (entityClassification !== 'entity') return lsAlert('Agency records must use the entity classification.');
        if (!brokerNumber || !ein) return lsAlert('Broker number and EIN are required agency identifiers.');
        const duplicateAgency = data.brokerages.find(item => item.id !== id && (
            String(item.name || '').trim().toLowerCase() === name.trim().toLowerCase() ||
            (brokerNumber && String(item.brokerNumber || item.brokerCode || '') === brokerNumber) ||
            (npn && String(item.npn || '') === npn)
        ));
        if (duplicateAgency) return lsAlert('An agency with this name, broker number, or NPN already exists.');
        
        let commissionMin = parseFloat(document.getElementById('ls-b-cmin').value) || 0;
        let commissionDefault = parseFloat(document.getElementById('ls-b-cdef').value) || 0;
        let commissionMax = parseFloat(document.getElementById('ls-b-cmax').value) || 0;
        
        if (commissionMin > commissionDefault || commissionDefault > commissionMax) {
            return lsAlert('Commission error: Ensure Min &le; Default &le; Max');
        }
        
        let updates = { name, brokerNumber, brokerCode: brokerNumber, npn, ein, type, entityClassification, ahAuthority, lineOfAuthority: ahAuthority, status, states: statesArr, effectiveDate, expirationDate, commissionMin, commissionDefault, commissionMax, verificationSource: id ? (data.brokerages.find(x => x.id === id)?.verificationSource || 'Operator-maintained') : 'Operator-maintained', lastVerifiedAt: id ? (data.brokerages.find(x => x.id === id)?.lastVerifiedAt || '') : '' };

        if (id) {
            let b = data.brokerages.find(x => x.id === id);
            if(b) {
                let before = { ...b };
                Object.assign(b, updates);
                logAudit('UPDATE_BROKERAGE', `Updated brokerage ${id}`, id, before, b);
            }
        } else {
            let newId = generateId('B');
            let b = { id: newId, ...updates };
            data.brokerages.push(b);
            logAudit('CREATE_BROKERAGE', `Created brokerage ${newId}`, newId, null, b);
        }
        saveState();
        syncCRM();
        closeModal();
        renderBrokerages();
    }

    window.lsRenderAgents = renderAgents;
    window.lsEditAgent = editAgent;
    window.lsSaveAgent = saveAgent;

    function renderAgents() {
        setActions(`
            <button class="btn btn-teal" style="background:var(--tinubu-teal);color:white;" onclick="lsEditAgent()"><i class="fa-solid fa-user-plus"></i> Add Agent</button>
        `);
        
        setContent(`
            <div class="ls-filters-bar">
                <div class="form-group" style="margin:0; flex:1; min-width:200px;">
                    <input type="text" class="form-control" placeholder="Search agents..." onkeyup="lsFilterAgents(this.value)">
                </div>
            </div>
            <div class="card">
                <table class="data-table" id="ls-agents-table">
                    <thead><tr><th>Producer / NIPR identity</th><th>Agency relationship</th><th>Licensing &amp; LOA</th><th>Appointment / filing</th><th>Verification</th><th>Status / exceptions</th></tr></thead>
                    <tbody>
                        ${data.agents.map(a => {
                            let b = data.brokerages.find(x => x.id === a.brokerageId);
                            let bName = b ? b.name : 'Unknown';
                            let licCount = data.stateLicenses.filter(l => l.agentId === a.id).length;
                            let aStatus = a.status === 'Active' ? 'ls-badge-active' : (a.status === 'Terminated' ? 'ls-badge-term' : 'ls-badge-pending');
                            return `
                                <tr class="ls-table-row" onclick="lsEditAgent('${safeActionId(a.id)}')">
                                    <td><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.id)} · NPN ${escapeHtml(a.npn || '—')}</small></td>
                                    <td>${escapeHtml(bName === 'Unknown' ? 'Not assigned in index' : bName)}<small>${escapeHtml(a.individualClassification || 'individual')}</small></td>
                                    <td>${licCount} state license(s)<small>${escapeHtml(a.ahAuthority || a.lineOfAuthority || 'LOA not recorded')}</small></td>
                                    <td>${entityComplianceSummary('producer', a).appointments.length} appointment record(s)<small>${entityComplianceSummary('producer', a).workItems.length} work item(s)</small></td>
                                    <td>${escapeHtml(a.verificationSource || 'Operator-maintained')}<small>${escapeHtml(a.lastVerifiedAt ? new Date(a.lastVerifiedAt).toLocaleDateString() : 'Not externally verified')}</small></td>
                                    <td><span class="ls-badge ${aStatus}">${escapeHtml(a.status)}</span><small>${escapeHtml((a.exceptions || []).join(', ') || 'No exception')}</small></td>
                                </tr>
                            `;
                        }).join('')}
                        ${data.agents.length === 0 ? '<tr><td colspan="6" style="text-align:center;">No producers found</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `);
    }

    window.lsFilterAgents = function(val) {
        let rows = document.querySelectorAll('#ls-agents-table tbody tr');
        let lower = val.toLowerCase();
        rows.forEach(r => {
            if (r.innerText.toLowerCase().includes(lower)) r.style.display = '';
            else r.style.display = 'none';
        });
    }

    function editAgent(id) {
        let a = id ? data.agents.find(x => x.id === id) : { id: '', name: '', licenseNumber: '', npn: '', email: '', phone: '', brokerageId: '', status: 'Active', individualClassification: 'individual', ahAuthority: 'Accident & Health', effectiveDate: new Date().toISOString().slice(0, 10), expirationDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) };
        let isNew = !id;
        
        let lics = isNew ? [] : data.stateLicenses.filter(l => l.agentId === id);
        
        let html = `
            ${!isNew ? complianceOverviewHtml('producer', a) : ''}
            <div class="form-grid">
                <div class="form-group">
                    <label>Agent Name</label>
                    <input type="text" class="form-control" id="ls-a-name" value="${escapeHtml(a.name)}">
                </div>
                <div class="form-group">
                    <label>Agent License Number</label>
                    <input type="text" class="form-control" id="ls-a-license-number" value="${escapeHtml(a.licenseNumber || '')}" placeholder="e.g. 15109">
                </div>
                <div class="form-group">
                    <label>NPN</label>
                    <input type="text" class="form-control" id="ls-a-npn" value="${escapeHtml(a.npn || '')}">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" class="form-control" id="ls-a-email" value="${escapeHtml(a.email || '')}">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" class="form-control" id="ls-a-phone" value="${escapeHtml(a.phone || '')}">
                </div>
                <div class="form-group">
                    <label>Brokerage</label>
                    <select class="form-control" id="ls-a-brokerage">
                        <option value="">-- Select --</option>
                        ${data.brokerages.map(b => `<option value="${escapeHtml(b.id)}" ${a.brokerageId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-control" id="ls-a-status">
                        <option value="Active" ${a.status==='Active'?'selected':''}>Active</option>
                        <option value="Pending" ${a.status==='Pending'?'selected':''}>Pending</option>
                        <option value="Terminated" ${a.status==='Terminated'?'selected':''}>Terminated</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Individual classification</label>
                    <select class="form-control" id="ls-a-classification">
                        <option value="individual" ${a.individualClassification !== 'entity' ? 'selected' : ''}>Individual producer</option>
                        <option value="entity" ${a.individualClassification === 'entity' ? 'selected' : ''}>Entity producer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>A&H authority / LOA</label>
                    <input type="text" class="form-control" id="ls-a-ah-authority" value="${escapeHtml(a.ahAuthority || a.lineOfAuthority || a.loa || '')}" placeholder="e.g. A&H, Health, Accident">
                </div>
                <div class="form-group">
                    <label>Authority Effective Date</label>
                    <input type="date" class="form-control" id="ls-a-eff" value="${escapeHtml(a.effectiveDate || '')}">
                </div>
                <div class="form-group">
                    <label>Authority Expiration Date</label>
                    <input type="date" class="form-control" id="ls-a-exp" value="${escapeHtml(a.expirationDate || '')}">
                </div>
            </div>
            
            ${!isNew ? `
            <h4 style="margin:20px 0 10px; font-size:13px; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">State Licenses</h4>
            <table class="data-table">
                <thead><tr><th>State</th><th>License #</th><th>Effective</th><th>Expires</th><th>Status</th></tr></thead>
                <tbody>
                    ${lics.map(l => {
                        let expMs = new Date(l.expirationDate).getTime();
                        let isExp = expMs < Date.now();
                        let cls = isExp ? 'ls-badge-expired' : (l.status === 'Active' ? 'ls-badge-active' : 'ls-badge-term');
                        return `
                            <tr>
                                <td>${escapeHtml(l.state)}</td>
                        <td>${escapeHtml(l.licenseNumber || l.number)}</td>
                                <td>${escapeHtml(l.effectiveDate)}</td>
                                <td>${escapeHtml(l.expirationDate)}</td>
                                <td><span class="ls-badge ${cls}">${escapeHtml(isExp ? 'Expired' : l.status)}</span></td>
                            </tr>
                        `;
                    }).join('')}
                    ${lics.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No licenses found</td></tr>' : ''}
                </tbody>
            </table>
            <div style="margin-top: 10px;">
                <button class="btn btn-secondary btn-sm" onclick="lsAddLicense('${safeActionId(a.id)}')"><i class="fa-solid fa-plus"></i> Add State License</button>
            </div>
            ` : ''}
        `;
        
        showModal(isNew ? 'New Agent' : 'Edit Agent: ' + a.name, html, `
            <button class="btn btn-secondary" onclick="document.getElementById('ls-modal-overlay').style.display='none'">Cancel</button>
            <button class="btn btn-primary" onclick="lsSaveAgent('${isNew ? '' : safeActionId(a.id)}')">Save Changes</button>
        `, '700px');
    }

    function saveAgent(id) {
        let name = document.getElementById('ls-a-name').value;
        let npn = document.getElementById('ls-a-npn').value;
        let licenseNumber = document.getElementById('ls-a-license-number').value.trim();
        let email = document.getElementById('ls-a-email').value;
        let phone = document.getElementById('ls-a-phone').value.trim();
        let brokerageId = document.getElementById('ls-a-brokerage').value;
        let status = document.getElementById('ls-a-status').value;
        let individualClassification = document.getElementById('ls-a-classification').value;
        let ahAuthority = document.getElementById('ls-a-ah-authority').value.trim();
        let effectiveDate = canonicalDate(document.getElementById('ls-a-eff').value);
        let expirationDate = canonicalDate(document.getElementById('ls-a-exp').value);
        
        if (!name) return lsAlert('Name is required');
        if (!ahAuthority) return lsAlert('A&H authority / LOA is required.');
        if (!npn || !licenseNumber) return lsAlert('NPN and producer license number are required.');
        if (!brokerageId || !data.brokerages.some(item => item.id === brokerageId)) return lsAlert('Select a valid agency relationship.');
        if (individualClassification !== 'individual') return lsAlert('Producer records must use the individual classification.');
        if (!effectiveDate || !expirationDate || Date.parse(effectiveDate + 'T00:00:00Z') > Date.parse(expirationDate + 'T00:00:00Z')) return lsAlert('Enter a valid authority date range.');
        const duplicateProducer = data.agents.find(item => item.id !== id && (
            String(item.name || '').trim().toLowerCase() === name.trim().toLowerCase() ||
            String(item.npn || '') === npn ||
            String(item.licenseNumber || '') === licenseNumber
        ));
        if (duplicateProducer) return lsAlert('A producer with this name, NPN, or license number already exists.');
        
        let brokerage = data.brokerages.find(x => x.id === brokerageId);
        let updates = { name, licenseNumber, npn, email, phone, brokerageId, brokerage: brokerage ? brokerage.name : '', status, individualClassification, ahAuthority, lineOfAuthority: ahAuthority, effectiveDate, expirationDate, verificationSource: id ? (data.agents.find(x => x.id === id)?.verificationSource || 'Operator-maintained') : 'Operator-maintained', lastVerifiedAt: id ? (data.agents.find(x => x.id === id)?.lastVerifiedAt || '') : '' };

        if (id) {
            let a = data.agents.find(x => x.id === id);
            if(a) {
                let before = { ...a };
                Object.assign(a, updates);
                if (licenseNumber) {
                    data.stateLicenses.filter(l => l.agentId === id).forEach(l => { l.number = licenseNumber; l.licenseNumber = licenseNumber; });
                }
                logAudit('UPDATE_AGENT', `Updated agent ${id}`, id, before, a);
            }
        } else {
            let newId = generateId('A');
            let a = { id: newId, ...updates };
            data.agents.push(a);
            logAudit('CREATE_AGENT', `Created agent ${newId}`, newId, null, a);
        }
        saveState();
        syncCRM();
        closeModal();
        renderAgents();
    }

    window.lsAddLicense = function(agentId) {
        let html = `
            <div class="form-grid">
                <div class="form-group">
                    <label>State</label>
                    <input type="text" class="form-control" id="ls-l-state" placeholder="e.g. PA, NY, FL" maxlength="2">
                </div>
                <div class="form-group">
                    <label>License #</label>
                    <input type="text" class="form-control" id="ls-l-number">
                </div>
                <div class="form-group">
                    <label>Effective Date</label>
                    <input type="date" class="form-control" id="ls-l-eff">
                </div>
                <div class="form-group">
                    <label>Expiration Date</label>
                    <input type="date" class="form-control" id="ls-l-exp">
                </div>
                <div class="form-group">
                    <label>License status</label>
                    <select class="form-control" id="ls-l-status">
                        <option value="Active">Active</option>
                        <option value="Pending">Pending</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>A&H line of authority</label>
                    <input type="text" class="form-control" id="ls-l-loa" value="Accident & Health" placeholder="e.g. A&H, Health, Disability">
                </div>
            </div>
        `;
        showModal('Add License for Agent', html, `
            <button class="btn btn-secondary" onclick="lsEditAgent('${agentId}')">Cancel</button>
            <button class="btn btn-primary" onclick="lsSaveLicense('${agentId}')">Save License</button>
        `);
    };

    window.lsSaveLicense = function(agentId) {
        let state = document.getElementById('ls-l-state').value.toUpperCase();
        let num = document.getElementById('ls-l-number').value;
        let eff = canonicalDate(document.getElementById('ls-l-eff').value);
        let exp = canonicalDate(document.getElementById('ls-l-exp').value);
        let lineOfAuthority = document.getElementById('ls-l-loa').value.trim();
        let status = document.getElementById('ls-l-status').value;
        
        if (!state || !eff || !exp) return lsAlert('State, Effective, and Expiration dates are required');
        if (!/^[A-Z]{2}$/.test(state) || !(licensingRules().getRules && licensingRules().getRules(state).individual)) return lsAlert('Enter a supported two-letter state code.');
        if (Date.parse(eff + 'T00:00:00Z') > Date.parse(exp + 'T00:00:00Z')) return lsAlert('Expiration date must be on or after the effective date.');
        if (!lineOfAuthority) return lsAlert('A&H line of authority is required.');
        if (data.stateLicenses.some(item => item.agentId === agentId && item.state === state)) return lsAlert('This producer already has a license record for ' + state + '. Edit the existing record instead.');
        
        let newId = generateId('L');
        let lic = { id: newId, agentId, state, number: num, licenseNumber: num, lineOfAuthority, ahAuthority: lineOfAuthority, effectiveDate: eff, expirationDate: exp, status, verificationSource: 'Operator-maintained', lastVerifiedAt: '' };
        data.stateLicenses.push(lic);
        logAudit('ADD_LICENSE', `Added ${state} license for agent ${agentId}`, newId, null, lic);
        saveState();
        editAgent(agentId);
    };

    function renderComms() {
        setActions('');
        
        let html = '<div class="card"><div class="card-header"><div class="card-title">Renewal Cadence</div></div><table class="data-table"><thead><tr><th>Stage</th><th>Trigger</th><th>Template ID</th><th>Status</th></tr></thead><tbody>';
        (data.communicationCadence || []).forEach(c => {
            html += `<tr><td>${escapeHtml(c.stage)}</td><td>${escapeHtml(c.triggerDays)} days</td><td>${escapeHtml(c.templateId)}</td><td>${escapeHtml(c.status || 'Active')}</td></tr>`;
        });
        if ((data.communicationCadence || []).length === 0) html += '<tr><td colspan="4" style="text-align:center;">No cadence defined</td></tr>';
        html += '</tbody></table></div>';
        
        html += '<div class="card" style="margin-top:16px;"><div class="card-header"><div class="card-title">Communication Log</div></div><table class="data-table"><thead><tr><th>Date</th><th>Entity</th><th>Type</th><th>Notes</th></tr></thead><tbody>';
        (data.communicationLog || []).forEach(l => {
            html += `<tr><td>${escapeHtml(l.date)}</td><td>${escapeHtml(l.entityId)}</td><td>${escapeHtml(l.type)}</td><td>${escapeHtml(l.notes)}</td></tr>`;
        });
        if ((data.communicationLog || []).length === 0) html += '<tr><td colspan="4" style="text-align:center;">No logs found</td></tr>';
        html += '</tbody></table></div>';
        
        setContent(html);
    }

    const appointmentUi = {
        subview: 'evaluate',
        draft: { product: 'Group Stop Loss', state: '', brokerageId: '', agentId: '', applicationDate: '', effectiveDate: '', appointmentStatus: '', carrier: '', carrierCode: '', reference: '' },
        result: null,
        evaluating: false,
        profileAgentId: '',
        queueStatus: 'ALL',
        queueSearch: '',
        selectedWorkItemId: ''
    };

    function appointmentRulesList() {
        return data.licensingRules && data.licensingRules.appointmentRules || licensingRules().appointmentRules || [];
    }

    function appointmentIndividualRules() {
        return data.licensingRules && data.licensingRules.individualRules || licensingRules().individualRules || [];
    }

    function appointmentActor() {
        return window.Clerk && window.Clerk.user && window.Clerk.user.primaryEmailAddress && window.Clerk.user.primaryEmailAddress.emailAddress || 'Authorized workspace user';
    }

    function maskIdentifier(value) {
        const raw = String(value || '').trim();
        if (!raw) return '—';
        return raw.length <= 4 ? '••••' : '••••' + raw.slice(-4);
    }

    function appointmentBadge(status) {
        const value = String(status || 'Unknown');
        const css = /resolved|active|appointed|completed|released|not_required/i.test(value)
            ? 'ls-badge-active'
            : /cancel|term|forfeit|block|fail|expired/i.test(value)
                ? 'ls-badge-expired'
                : /pending|ready|submitted|hold|review/i.test(value)
                    ? 'ls-badge-pending'
                    : 'ls-badge-term';
        return '<span class="ls-badge ' + css + '">' + escapeHtml(value.replace(/_/g, ' ')) + '</span>';
    }

    function appointmentDraftFromForm() {
        const value = id => {
            const element = document.getElementById(id);
            return element ? String(element.value || '').trim() : '';
        };
        appointmentUi.draft = {
            product: value('nipr-product') || appointmentUi.draft.product,
            state: value('nipr-state'),
            brokerageId: value('nipr-brokerage'),
            agentId: value('nipr-agent'),
            applicationDate: value('nipr-application-date'),
            effectiveDate: value('nipr-effective-date'),
            appointmentStatus: value('nipr-appointment-status'),
            carrier: value('nipr-carrier'),
            carrierCode: value('nipr-carrier-code'),
            reference: value('nipr-reference')
        };
        return appointmentUi.draft;
    }

    function appointmentSelection(draft) {
        const agent = data.agents.find(item => String(item.id) === String(draft.agentId));
        const brokerage = data.brokerages.find(item => String(item.id) === String(draft.brokerageId)) ||
            data.brokerages.find(item => agent && (item.id === agent.brokerageId || item.name === agent.brokerage));
        const existing = (data.niprAppointments || []).find(item => item.agentId === draft.agentId && item.state === draft.state);
        return {
            product: draft.product,
            state: draft.state,
            brokerageId: brokerage && brokerage.id || draft.brokerageId,
            brokerageName: brokerage && brokerage.name || '',
            agentId: agent && agent.id || draft.agentId,
            agentName: agent && agent.name || '',
            applicationDate: draft.applicationDate,
            effectiveDate: draft.effectiveDate,
            appointmentStatus: draft.appointmentStatus || existing && existing.status || 'Not Appointed',
            appointmentStatusSource: existing && (existing.verifiedSource || existing.source) || 'Operator input; not externally verified',
            carrier: draft.carrier || 'Carrier not supplied',
            carrierCode: draft.carrierCode,
            reference: draft.reference
        };
    }

    function localAppointmentEvaluation(selection, error) {
        const validation = window.LicensingSuite.validateSelection(selection);
        const rule = validation.appointment || appointmentRulesList().find(item => item.state === selection.state) || null;
        const trace = [
            { step: 'Context resolution', status: 'completed', detail: selection.product + ' · ' + selection.state + ' · effective ' + selection.effectiveDate, source: 'Application transaction' },
            { step: 'Product / LOA resolution', status: validation.valid ? 'completed' : 'blocked', detail: 'Accident & Health authority is required.', source: rule && rule.sourceFile || 'Cached licensing rules' },
            { step: 'License authority', status: validation.valid ? 'completed' : 'blocked', detail: validation.valid ? 'Cached protected licensing records passed validation.' : validation.reason || 'License authority failed.', source: 'Cached protected licensing state' },
            { step: 'Carrier appointment', status: validation.advisory && validation.advisory.length ? 'advisory' : 'completed', detail: validation.advisory && validation.advisory[0] && validation.advisory[0].message || 'Appointment is active or not required.' },
            { step: 'State rule and filing window', status: rule ? 'completed' : 'unavailable', detail: rule ? selection.state + ' uses ' + rule.ruleType + '; ' + (rule.filingWindowDays == null ? 'no filing window is recorded.' : rule.filingWindowDays + '-day filing window.') : 'Rule unavailable.' },
            { step: 'PAS action', status: validation.valid ? 'advisory' : 'blocked', detail: validation.valid ? 'Appointment handling remains advisory only; no live filing or approval occurred.' : 'Quote progression and bind remain blocked by license authority.' }
        ];
        return Object.assign({}, validation, {
            appointment: rule,
            product: selection.product,
            carrier: selection.carrier,
            carrierCode: selection.carrierCode,
            decisionTrace: trace,
            filingWindow: { filingWindowDays: rule && rule.filingWindowDays, filingDeadline: null, fee: rule && rule.fee },
            productResolution: { product: selection.product, requiredLoa: 'Accident & Health', authoritative: false, source: 'Cached licensing rules' },
            sourceMetadata: { sourceFile: rule && rule.sourceFile || 'Cached licensing rules', sourceEffectiveDate: rule && rule.sourceEffectiveDate || '', liveNipr: false, authoritative: false, unavailableReason: error && error.message || 'Authoritative server result unavailable' }
        });
    }

    async function evaluateAppointmentWorkspace() {
        if (appointmentUi.evaluating) return;
        const selection = appointmentSelection(appointmentDraftFromForm());
        if (!selection.brokerageName || !selection.agentName || !selection.state || !selection.effectiveDate) {
            lsAlert('Select a brokerage, producer, state, and effective date before evaluating.');
            return;
        }
        appointmentUi.evaluating = true;
        renderNipr('evaluate');
        try {
            const apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/validate') : '/api/licensing/validate';
            const response = await (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/validate', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection)
            }) : fetch(apiUrl, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection)
            }));
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.error || 'Authoritative appointment evaluation failed.');
                error.payload = payload;
                throw error;
            }
            appointmentUi.result = payload;
            data.appointmentEvaluations.unshift({
                id: generateId('AE'),
                createdAt: new Date().toISOString(),
                actor: appointmentActor(),
                selection,
                result: payload,
                source: 'Server-authoritative protected licensing validation'
            });
            data.appointmentEvaluations = data.appointmentEvaluations.slice(0, 100);
            logAudit('APPOINTMENT_EVALUATED', JSON.stringify({ reference: selection.reference || null, state: selection.state, producer: selection.agentName, result: payload.reasonCode || payload.code }), selection.agentId);
        } catch (error) {
            appointmentUi.result = error && error.payload && error.payload.decisionTrace
                ? Object.assign({}, error.payload, { sourceMetadata: Object.assign({}, error.payload.sourceMetadata, { authoritative: true, liveNipr: false }) })
                : localAppointmentEvaluation(selection, error);
            data.appointmentEvaluations.unshift({
                id: generateId('AE'),
                createdAt: new Date().toISOString(),
                actor: appointmentActor(),
                selection,
                result: appointmentUi.result,
                source: appointmentUi.result.sourceMetadata && appointmentUi.result.sourceMetadata.authoritative === false ? 'Cached fallback' : 'Server-authoritative protected licensing validation'
            });
            data.appointmentEvaluations = data.appointmentEvaluations.slice(0, 100);
            logAudit('APPOINTMENT_EVALUATION_FAILED', JSON.stringify({ reference: selection.reference || null, state: selection.state, producer: selection.agentName, reason: appointmentUi.result.reason || appointmentUi.result.error || 'Validation failed' }), selection.agentId);
        } finally {
            appointmentUi.evaluating = false;
            saveState();
            renderNipr('evaluate');
        }
    }

    function applyAppointmentServerState(payload) {
        data = payload.state;
        stateVersion = payload.version;
        stateRevision = 0;
        normalizeState();
        saveState(false);
        syncCRM();
    }

    async function appointmentMutation(path, body) {
        const apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl(path) : '/api' + path;
        const response = await (window.stopLossApiFetch ? window.stopLossApiFetch(path, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }) : fetch(apiUrl, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }));
        const payload = await response.json().catch(() => ({}));
        if (response.status === 409 && payload.current) {
            applyAppointmentServerState(payload.current);
            throw new Error('Another user updated licensing first. The latest protected state has been loaded; review and try again.');
        }
        if (!response.ok) throw new Error(payload.error || 'The protected appointment action could not be saved.');
        applyAppointmentServerState(payload);
        return payload;
    }

    async function createAppointmentWorkItem() {
        const result = appointmentUi.result;
        const selection = appointmentSelection(appointmentUi.draft);
        if (!result) return lsAlert('Run an appointment evaluation first.');
        if (result.valid === false) return lsAlert('Resolve the license-authority failure before creating an appointment action.');
        if (!stateVersion || !window.__tinubuLicensingAuthoritative) return lsAlert('Connect an authorized protected workspace session before creating an appointment work item.');
        const rule = result.appointment || appointmentRulesList().find(item => item.state === selection.state) || {};
        const item = {
            licenseValidationValid: result.valid === true,
            producerId: selection.agentId,
            producerName: selection.agentName,
            brokerageId: selection.brokerageId,
            brokerageName: selection.brokerageName,
            policyOrQuote: selection.reference || 'Unlinked evaluation',
            product: selection.product,
            state: selection.state,
            carrier: selection.carrier,
            carrierCode: selection.carrierCode,
            appointmentRuleId: rule.id || null,
            appointmentRuleType: rule.ruleType || 'unavailable',
            requiredParty: rule.requiredParty || null,
            requiredLoa: result.productResolution && result.productResolution.requiredLoa || 'Accident & Health',
            applicationDate: selection.applicationDate || null,
            requestedEffectiveDate: selection.effectiveDate,
            filingWindowDays: result.filingWindow && result.filingWindow.filingWindowDays != null ? result.filingWindow.filingWindowDays : rule.filingWindowDays,
            filingDeadline: result.filingWindow && result.filingWindow.filingDeadline || null,
            fee: result.filingWindow && result.filingWindow.fee != null ? result.filingWindow.fee : rule.fee,
            evidence: { decisionTrace: result.decisionTrace || [], validation: result.evidence || {}, sourceMetadata: result.sourceMetadata || {}, liveNipr: false },
        };
        try {
            const payload = await appointmentMutation('/licensing/appointment-work-items', { version: stateVersion, item });
            appointmentUi.selectedWorkItemId = payload.state.appointmentWorkItems && payload.state.appointmentWorkItems[0] && payload.state.appointmentWorkItems[0].id || '';
            renderNipr('queue');
        } catch (error) {
            lsAlert(escapeHtml(error.message));
            renderNipr('evaluate');
        }
    }

    function appointmentPayload(item) {
        return {
            schema: 'tinubu.simulated-nipr-appointment.v1',
            simulated: true,
            generatedAt: new Date().toISOString(),
            transaction: {
                workItemId: item.id,
                producerId: item.producerId,
                producerName: item.producerName,
                brokerageId: item.brokerageId,
                brokerageName: item.brokerageName,
                policyOrQuote: item.policyOrQuote,
                product: item.product,
                state: item.state,
                carrier: item.carrier,
                carrierCode: item.carrierCode || null,
                appointmentRuleId: item.appointmentRuleId,
                appointmentRuleType: item.appointmentRuleType,
                requiredParty: item.requiredParty,
                requiredLoa: item.requiredLoa,
                applicationDate: item.applicationDate,
                requestedEffectiveDate: item.requestedEffectiveDate,
                filingWindowDays: item.filingWindowDays,
                filingDeadline: item.filingDeadline,
                fee: item.fee
            },
            evidence: item.evidence,
            notice: 'Simulation only. No NIPR, state DOI, carrier, payment, or accounting submission occurred.'
        };
    }

    async function transitionAppointmentWorkItem(id, action) {
        const item = data.appointmentWorkItems.find(entry => entry.id === id);
        if (!item) return;
        const allowed = {
            submit: ['READY_FOR_REVIEW'],
            resolve: ['SUBMITTED_SIMULATED'],
            cancel: ['READY_FOR_REVIEW', 'SUBMITTED_SIMULATED'],
            terminate: ['RESOLVED_REVIEWED']
        };
        if (!(allowed[action] || []).includes(item.status)) return lsAlert('That action is not allowed while the work item is ' + item.status.replace(/_/g, ' ') + '.');
        const reason = window.prompt('Enter the reviewed reason for this ' + action + ' action:');
        if (!reason || !reason.trim()) return;
        try {
            await appointmentMutation('/licensing/appointment-work-items/' + encodeURIComponent(id) + '/transition', {
                version: stateVersion,
                action,
                reason: reason.trim()
            });
            renderNipr('queue');
        } catch (error) {
            lsAlert(escapeHtml(error.message));
            renderNipr('queue');
        }
    }

    function showAppointmentWorkItem(id) {
        const item = data.appointmentWorkItems.find(entry => entry.id === id);
        if (!item) return;
        const outbox = data.appointmentOutbox.find(entry => entry.workItemId === id);
        const payload = outbox && outbox.payload || appointmentPayload(item);
        showModal('Appointment work item ' + item.id, `
            <div class="nipr-detail-grid">
                <div><span>Producer</span><strong>${escapeHtml(item.producerName)}</strong></div>
                <div><span>Brokerage</span><strong>${escapeHtml(item.brokerageName)}</strong></div>
                <div><span>Policy / quote</span><strong>${escapeHtml(item.policyOrQuote)}</strong></div>
                <div><span>Status</span><strong>${appointmentBadge(item.status)}</strong></div>
                <div><span>Rule</span><strong>${escapeHtml(item.appointmentRuleType)}</strong></div>
                <div><span>Requested effective</span><strong>${escapeHtml(item.requestedEffectiveDate || '—')}</strong></div>
            </div>
            <div class="nipr-truth-note"><strong>Simulation boundary:</strong> This payload is a review artifact. It does not represent a live NIPR filing, state approval, carrier confirmation, payment, or accounting movement.</div>
            <label class="nipr-payload-label" for="nipr-payload-modal">Simulated outbox payload</label>
            <pre id="nipr-payload-modal" class="nipr-payload">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
        `, `<button class="btn btn-secondary" onclick="lsCopyAppointmentPayload('${safeActionId(item.id)}')"><i class="fa-solid fa-copy"></i> Copy payload</button>
            <button class="btn btn-secondary" onclick="lsDownloadAppointmentPayload('${safeActionId(item.id)}')"><i class="fa-solid fa-download"></i> Download JSON</button>
            <button class="btn btn-navy" onclick="document.getElementById('ls-modal-overlay').style.display='none'">Close</button>`, '850px');
    }

    function appointmentPayloadForId(id) {
        const item = data.appointmentWorkItems.find(entry => entry.id === id);
        if (!item) return null;
        const outbox = data.appointmentOutbox.find(entry => entry.workItemId === id);
        return outbox && outbox.payload || appointmentPayload(item);
    }

    function copyAppointmentPayload(id) {
        const payload = appointmentPayloadForId(id);
        if (!payload) return;
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => lsAlert('Simulated payload copied for review.')).catch(() => lsAlert('The browser could not copy the payload.'));
    }

    function downloadAppointmentPayload(id) {
        const payload = appointmentPayloadForId(id);
        if (!payload) return;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = id + '-simulated-nipr-payload.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function appointmentSubviewButton(id, label, icon) {
        return '<button type="button" class="nipr-subnav-btn' + (appointmentUi.subview === id ? ' active' : '') + '" onclick="lsNiprSubview(\'' + id + '\')" aria-pressed="' + (appointmentUi.subview === id) + '"><i class="fa-solid ' + icon + '"></i>' + label + '</button>';
    }

    function renderAppointmentEvaluate() {
        const rules = appointmentRulesList();
        const state = appointmentUi.draft.state || rules[0] && rules[0].state || '';
        const agent = data.agents.find(item => String(item.id) === String(appointmentUi.draft.agentId)) || data.agents[0];
        const brokerage = data.brokerages.find(item => String(item.id) === String(appointmentUi.draft.brokerageId)) ||
            data.brokerages.find(item => agent && (item.id === agent.brokerageId || item.name === agent.brokerage)) || data.brokerages[0];
        const storedAppointment = (data.niprAppointments || []).find(item => agent && item.agentId === agent.id && item.state === state);
        const attestedStatus = appointmentUi.draft.appointmentStatus || storedAppointment && storedAppointment.status || 'Not Appointed';
        appointmentUi.draft.state = state;
        appointmentUi.draft.agentId = agent && agent.id || '';
        appointmentUi.draft.brokerageId = brokerage && brokerage.id || '';
        if (!appointmentUi.draft.effectiveDate) appointmentUi.draft.effectiveDate = new Date().toISOString().slice(0, 10);
        if (!appointmentUi.draft.applicationDate) appointmentUi.draft.applicationDate = appointmentUi.draft.effectiveDate;
        const result = appointmentUi.result;
        const trace = result && result.decisionTrace || [];
        return `
            <div class="nipr-eval-grid">
                <div class="card nipr-eval-form">
                    <div class="card-header"><div class="card-title"><i class="fa-solid fa-list-check"></i> Appointment evaluation</div></div>
                    <div class="card-body">
                        <div class="form-grid">
                            <div class="form-group"><label for="nipr-product">Product</label><select id="nipr-product" class="form-control">
                                ${['Group Stop Loss','Business Travel Accident','Personal Accident','Critical Illness','Accidental Death & Dismemberment'].map(value => '<option' + (appointmentUi.draft.product === value ? ' selected' : '') + '>' + escapeHtml(value) + '</option>').join('')}
                            </select></div>
                            <div class="form-group"><label for="nipr-state">Policy state</label><select id="nipr-state" class="form-control">${rules.map(rule => '<option value="' + escapeHtml(rule.state) + '"' + (state === rule.state ? ' selected' : '') + '>' + escapeHtml(rule.state) + '</option>').join('')}</select></div>
                            <div class="form-group"><label for="nipr-brokerage">Brokerage</label><select id="nipr-brokerage" class="form-control">${data.brokerages.map(item => '<option value="' + escapeHtml(item.id) + '"' + (brokerage && item.id === brokerage.id ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>').join('')}</select></div>
                            <div class="form-group"><label for="nipr-agent">Producer</label><select id="nipr-agent" class="form-control">${data.agents.map(item => '<option value="' + escapeHtml(item.id) + '"' + (agent && item.id === agent.id ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>').join('')}</select></div>
                            <div class="form-group"><label for="nipr-application-date">Application date</label><input id="nipr-application-date" type="date" class="form-control" value="${escapeHtml(appointmentUi.draft.applicationDate)}"></div>
                            <div class="form-group"><label for="nipr-effective-date">Requested effective date</label><input id="nipr-effective-date" type="date" class="form-control" value="${escapeHtml(appointmentUi.draft.effectiveDate)}"></div>
                            <div class="form-group"><label for="nipr-appointment-status">Operator-attested carrier status</label><select id="nipr-appointment-status" class="form-control">${['Not Appointed','Pending','Appointed','Terminated','Unavailable'].map(value => '<option value="' + value + '"' + (attestedStatus === value ? ' selected' : '') + '>' + (value === 'Appointed' ? 'Appointed (not externally verified)' : value) + '</option>').join('')}</select></div>
                            <div class="form-group"><label for="nipr-reference">Policy / quote reference</label><input id="nipr-reference" class="form-control" value="${escapeHtml(appointmentUi.draft.reference)}" placeholder="Optional current transaction"></div>
                            <div class="form-group"><label for="nipr-carrier">Carrier</label><input id="nipr-carrier" class="form-control" value="${escapeHtml(appointmentUi.draft.carrier)}" placeholder="Carrier name"></div>
                            <div class="form-group"><label for="nipr-carrier-code">Carrier CoCode</label><input id="nipr-carrier-code" class="form-control" value="${escapeHtml(appointmentUi.draft.carrierCode)}" placeholder="If available"></div>
                        </div>
                        <button type="button" class="btn btn-navy" onclick="lsNiprEvaluate()" ${appointmentUi.evaluating ? 'disabled' : ''}><i class="fa-solid fa-shield-halved"></i> ${appointmentUi.evaluating ? 'Evaluating…' : 'Evaluate appointment'}</button>
                    </div>
                </div>
                <div class="card nipr-trace-card">
                    <div class="card-header"><div class="card-title"><i class="fa-solid fa-code-branch"></i> Decision trace</div>${result ? appointmentBadge(result.valid === false ? 'License blocked' : result.advisory && result.advisory.length ? 'Appointment advisory' : 'Authority valid') : ''}</div>
                    <div class="card-body">
                        ${!result ? '<div class="nipr-empty">Run an evaluation to see the server-authoritative A&H decision trace.</div>' : `
                            <div class="nipr-source-line"><strong>Rule source:</strong> ${escapeHtml(result.sourceMetadata && result.sourceMetadata.sourceFile || 'Unavailable')} · effective ${escapeHtml(result.sourceMetadata && result.sourceMetadata.sourceEffectiveDate || 'unavailable')} · <strong>No live NIPR connection</strong></div>
                            <ol class="nipr-trace">${trace.map((step, index) => '<li class="' + escapeHtml(step.status || '') + '"><span>' + (index + 1) + '</span><div><strong>' + escapeHtml(step.step) + '</strong><p>' + escapeHtml(step.detail || '') + '</p>' + (step.source ? '<small>Source: ' + escapeHtml(step.source) + '</small>' : '') + '</div></li>').join('')}</ol>
                            <div class="nipr-truth-note">${result.sourceMetadata && result.sourceMetadata.authoritative === false ? '<strong>Authoritative service unavailable.</strong> This result uses the cached protected licensing snapshot and is labeled non-authoritative.' : '<strong>Authoritative licensing result.</strong> Appointment handling remains advisory-only unless a configured rule explicitly says otherwise.'}</div>
                            ${result.valid === false
                                ? '<div class="nipr-source-line"><strong>Hard block:</strong> Resolve the license-authority failure before creating an appointment action.</div>'
                                : !window.__tinubuLicensingAuthoritative
                                    ? '<div class="nipr-source-line"><strong>Protected session required:</strong> Connect the authorized workspace before creating or changing durable appointment actions.</div>'
                                    : '<button type="button" class="btn btn-primary" onclick="lsCreateAppointmentWorkItem()"><i class="fa-solid fa-clipboard-check"></i> Create durable work item</button>'}
                        `}
                    </div>
                </div>
            </div>`;
    }

    function renderAppointmentProfile() {
        const selected = data.agents.find(item => String(item.id) === String(appointmentUi.profileAgentId)) || data.agents[0];
        appointmentUi.profileAgentId = selected && selected.id || '';
        const brokerage = data.brokerages.find(item => selected && (item.id === selected.brokerageId || item.name === selected.brokerage));
        const licenses = data.stateLicenses.filter(item => selected && item.agentId === selected.id);
        const appointments = data.niprAppointments.filter(item => selected && item.agentId === selected.id);
        return `
            <div class="ls-filters-bar"><label for="nipr-profile-agent"><strong>Producer profile</strong></label><select id="nipr-profile-agent" class="form-control nipr-inline-control" onchange="lsNiprProfile(this.value)">${data.agents.map(item => '<option value="' + escapeHtml(item.id) + '"' + (selected && item.id === selected.id ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>').join('')}</select></div>
            ${!selected ? '<div class="nipr-empty">No producer records are available.</div>' : `
            <div class="card">
                <div class="card-header"><div><div class="card-title"><i class="fa-solid fa-user-shield"></i> ${escapeHtml(selected.name)}</div><div class="nipr-profile-meta">${escapeHtml(brokerage && brokerage.name || selected.brokerage || 'No brokerage')} · NPN ${escapeHtml(maskIdentifier(selected.npn))} · source: protected licensing state</div></div>${appointmentBadge(selected.status)}</div>
                <div class="card-body">
                    <div class="nipr-detail-grid">
                        <div><span>Brokerage</span><strong>${escapeHtml(brokerage && brokerage.name || selected.brokerage || '—')}</strong></div>
                        <div><span>Producer identifier</span><strong>${escapeHtml(maskIdentifier(selected.licenseNumber || selected.npn))}</strong></div>
                        <div><span>Effective</span><strong>${escapeHtml(selected.effectiveDate || '—')}</strong></div>
                        <div><span>Expires</span><strong>${escapeHtml(selected.expirationDate || '—')}</strong></div>
                        <div><span>Last verified</span><strong>${escapeHtml(selected.lastVerifiedAt || selected.updatedAt || 'Not recorded')}</strong></div>
                        <div><span>Verification source</span><strong>${escapeHtml(selected.verificationSource || 'Protected licensing state; no live PDB refresh')}</strong></div>
                    </div>
                </div>
            </div>
            <div class="nipr-profile-grid">
                <div class="card"><div class="card-header"><div class="card-title">State licenses & LOAs</div></div><div class="nipr-table-scroll"><table class="data-table"><thead><tr><th>State</th><th>LOA</th><th>Status</th><th>Effective</th><th>Expires</th><th>Source</th></tr></thead><tbody>${licenses.map(item => '<tr><td><strong>' + escapeHtml(item.state) + '</strong></td><td>' + escapeHtml(item.lineOfAuthority || item.loa || item.type || 'Unavailable') + '</td><td>' + appointmentBadge(item.status) + '</td><td>' + escapeHtml(item.effectiveDate || '—') + '</td><td>' + escapeHtml(item.expirationDate || '—') + '</td><td>' + escapeHtml(item.source || 'Protected licensing state') + '</td></tr>').join('') || '<tr><td colspan="6">No state licenses recorded.</td></tr>'}</tbody></table></div></div>
                <div class="card"><div class="card-header"><div class="card-title">Carrier appointments</div></div><div class="nipr-table-scroll"><table class="data-table"><thead><tr><th>State</th><th>Carrier / CoCode</th><th>LOA</th><th>Status</th><th>Effective</th><th>Verified</th></tr></thead><tbody>${appointments.map(item => '<tr><td><strong>' + escapeHtml(item.state) + '</strong></td><td>' + escapeHtml(item.carrier || 'Carrier unavailable') + '<small>' + escapeHtml(item.carrierCode || item.coCode || '') + '</small></td><td>' + escapeHtml(item.lineOfAuthority || item.loa || 'A&H') + '</td><td>' + appointmentBadge(item.status) + '</td><td>' + escapeHtml(item.effectiveDate || item.date || '—') + '</td><td>' + escapeHtml(item.lastVerifiedAt || item.source || 'Not externally verified') + '</td></tr>').join('') || '<tr><td colspan="6">No carrier appointment records are linked to this producer.</td></tr>'}</tbody></table></div></div>
            </div>`}`;
    }

    function renderAppointmentQueue() {
        const statuses = ['ALL'].concat(Array.from(new Set(data.appointmentWorkItems.map(item => item.status))).sort());
        const search = appointmentUi.queueSearch.toLowerCase();
        const items = data.appointmentWorkItems.filter(item => (appointmentUi.queueStatus === 'ALL' || item.status === appointmentUi.queueStatus) &&
            (!search || [item.id, item.producerName, item.brokerageName, item.policyOrQuote, item.product, item.state, item.carrier].some(value => String(value || '').toLowerCase().includes(search))));
        const actions = item => {
            const buttons = ['<button class="btn btn-secondary btn-sm" onclick="lsViewAppointmentWorkItem(\'' + safeActionId(item.id) + '\')">Details</button>'];
            if (item.status === 'READY_FOR_REVIEW') buttons.push('<button class="btn btn-navy btn-sm" onclick="lsAppointmentTransition(\'' + safeActionId(item.id) + '\',\'submit\')">Submit simulated</button>');
            if (item.status === 'SUBMITTED_SIMULATED') buttons.push('<button class="btn btn-primary btn-sm" onclick="lsAppointmentTransition(\'' + safeActionId(item.id) + '\',\'resolve\')">Resolve reviewed</button>');
            if (['READY_FOR_REVIEW','SUBMITTED_SIMULATED'].includes(item.status)) buttons.push('<button class="btn btn-secondary btn-sm" onclick="lsAppointmentTransition(\'' + safeActionId(item.id) + '\',\'cancel\')">Cancel</button>');
            if (item.status === 'RESOLVED_REVIEWED') buttons.push('<button class="btn btn-secondary btn-sm" onclick="lsAppointmentTransition(\'' + safeActionId(item.id) + '\',\'terminate\')">Terminate</button>');
            return buttons.join(' ');
        };
        return `
            <div class="ls-filters-bar">
                <div class="form-group"><label for="nipr-queue-status">Status</label><select id="nipr-queue-status" class="form-control" onchange="lsNiprQueueFilter()">${statuses.map(value => '<option value="' + escapeHtml(value) + '"' + (value === appointmentUi.queueStatus ? ' selected' : '') + '>' + escapeHtml(value.replace(/_/g, ' ')) + '</option>').join('')}</select></div>
                <div class="form-group nipr-search-group"><label for="nipr-queue-search">Search work items</label><input id="nipr-queue-search" class="form-control" value="${escapeHtml(appointmentUi.queueSearch)}" placeholder="Producer, quote, state, carrier…" oninput="lsNiprQueueFilter()"></div>
            </div>
            <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-list-check"></i> Appointment operations queue</div><span>${items.length} shown</span></div><div class="nipr-table-scroll"><table class="data-table"><thead><tr><th>Work item</th><th>Producer / brokerage</th><th>Policy / quote</th><th>State / rule</th><th>Carrier</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(item => '<tr><td><strong>' + escapeHtml(item.id) + '</strong><small>' + escapeHtml(new Date(item.updatedAt || item.createdAt).toLocaleString()) + '</small></td><td>' + escapeHtml(item.producerName) + '<small>' + escapeHtml(item.brokerageName) + '</small></td><td>' + escapeHtml(item.policyOrQuote) + '<small>' + escapeHtml(item.product) + '</small></td><td><strong>' + escapeHtml(item.state) + '</strong><small>' + escapeHtml(item.appointmentRuleType) + '</small></td><td>' + escapeHtml(item.carrier || 'Unavailable') + '<small>' + escapeHtml(item.carrierCode || '') + '</small></td><td>' + appointmentBadge(item.status) + '</td><td class="nipr-row-actions">' + actions(item) + '</td></tr>').join('') || '<tr><td colspan="7" class="nipr-empty">No work items match these filters.</td></tr>'}</tbody></table></div></div>`;
    }

    function renderAppointmentMatrix() {
        const rules = appointmentRulesList();
        const individual = appointmentIndividualRules();
        const source = data.licensingRules && data.licensingRules.source || licensingRules().source || {};
        return `
            <div class="nipr-truth-note"><strong>Authoritative scope:</strong> ${rules.length} state and District of Columbia appointment rules from ${escapeHtml(source.file || 'the configured A&H workbook')} effective ${escapeHtml(source.effectiveDate || 'unavailable')}. Blank fees or windows mean the source does not provide a value.</div>
            <div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-table-list"></i> State & LOA matrix</div><span class="ls-badge ls-badge-active">${rules.length} jurisdictions</span></div><div class="nipr-table-scroll nipr-matrix-scroll"><table class="data-table"><thead><tr><th>State</th><th>Appointment type</th><th>Required party</th><th>Filing window</th><th>Fee</th><th>Applicable A&H authority</th><th>Source metadata</th></tr></thead><tbody>${rules.map(rule => {
                const loa = individual.find(item => item.state === rule.state);
                return '<tr><td><strong>' + escapeHtml(rule.state) + '</strong></td><td>' + appointmentBadge(rule.ruleType) + '</td><td>' + escapeHtml(rule.requiredParty) + '</td><td>' + escapeHtml(rule.filingWindowDays == null ? 'Not recorded' : rule.filingWindowDays + ' days') + '</td><td>' + escapeHtml(rule.fee == null ? 'Not recorded' : '$' + Number(rule.fee).toFixed(2)) + '</td><td>' + escapeHtml(loa && (loa.licenseType + ' · ' + loa.lineOfAuthority) || 'Unavailable') + '</td><td>' + escapeHtml(rule.sourceFile || source.file || 'Unavailable') + '<small>Effective ' + escapeHtml(rule.sourceEffectiveDate || source.effectiveDate || 'unavailable') + (rule.sourceNote ? ' · ' + escapeHtml(rule.sourceNote) : '') + '</small></td></tr>';
            }).join('')}</tbody></table></div></div>`;
    }

    function renderAppointmentLedger() {
        const pendingFees = data.appointmentLedger.filter(item => item.type === 'STATE_FEE' && item.status === 'PENDING' && typeof item.amount === 'number').reduce((sum, item) => sum + item.amount, 0);
        const commissionStatusByWorkItem = {};
        data.appointmentLedger.slice().reverse().filter(item => item.type === 'COMMISSION').forEach(item => { commissionStatusByWorkItem[item.workItemId] = item.status; });
        const held = Object.values(commissionStatusByWorkItem).filter(status => status === 'HELD').length;
        const released = data.appointmentLedger.filter(item => item.type === 'COMMISSION' && item.status === 'RELEASED').length;
        const forfeited = data.appointmentLedger.filter(item => item.type === 'COMMISSION' && item.status === 'FORFEITED').length;
        const audit = data.auditLogs.filter(item => /^APPOINTMENT_|^NIPR_/.test(item.action || '')).slice(0, 100);
        return `
            <div class="kpi-grid nipr-ledger-kpis">
                <div class="kpi-card"><div class="kpi-title">Recorded pending fees</div><div class="kpi-value">$${pendingFees.toFixed(2)}</div><div class="kpi-sub">Only submitted simulated work items</div></div>
                <div class="kpi-card"><div class="kpi-title">Commission holds</div><div class="kpi-value">${held}</div><div class="kpi-sub">Recorded transactions, no balance implied</div></div>
                <div class="kpi-card"><div class="kpi-title">Releases</div><div class="kpi-value">${released}</div><div class="kpi-sub">Reviewed release events</div></div>
                <div class="kpi-card"><div class="kpi-title">Forfeitures</div><div class="kpi-value">${forfeited}</div><div class="kpi-sub">Reviewed termination events</div></div>
            </div>
            <div class="nipr-ledger-grid">
                <div class="card"><div class="card-header"><div class="card-title">Appointment ledger</div></div><div class="nipr-table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Work item / policy</th><th>Type</th><th>Status</th><th>Recorded amount</th><th>Description</th></tr></thead><tbody>${data.appointmentLedger.map(item => '<tr><td>' + escapeHtml(new Date(item.createdAt).toLocaleString()) + '</td><td><button class="nipr-link-button" onclick="lsViewAppointmentWorkItem(\'' + safeActionId(item.workItemId) + '\')">' + escapeHtml(item.workItemId) + '</button><small>' + escapeHtml(item.policyOrQuote) + '</small></td><td>' + escapeHtml(item.type) + '</td><td>' + appointmentBadge(item.status) + '</td><td>' + escapeHtml(typeof item.amount === 'number' ? '$' + item.amount.toFixed(2) : 'No amount recorded') + '</td><td>' + escapeHtml(item.description) + '</td></tr>').join('') || '<tr><td colspan="6">No appointment transactions recorded.</td></tr>'}</tbody></table></div></div>
                <div class="card"><div class="card-header"><div class="card-title">Appointment audit activity</div></div><div class="nipr-audit-list">${audit.map(item => '<article><time>' + escapeHtml(new Date(item.timestamp).toLocaleString()) + '</time><strong>' + escapeHtml(item.action) + '</strong><p>' + escapeHtml(item.details) + '</p></article>').join('') || '<div class="nipr-empty">No appointment audit events recorded.</div>'}</div></div>
            </div>`;
    }

    window.lsRenderNipr = renderNipr;
    window.lsNiprSubview = function (view) { renderNipr(view); };
    window.lsNiprEvaluate = evaluateAppointmentWorkspace;
    window.lsCreateAppointmentWorkItem = createAppointmentWorkItem;
    window.lsAppointmentTransition = transitionAppointmentWorkItem;
    window.lsViewAppointmentWorkItem = showAppointmentWorkItem;
    window.lsCopyAppointmentPayload = copyAppointmentPayload;
    window.lsDownloadAppointmentPayload = downloadAppointmentPayload;
    window.lsNiprProfile = function (id) { appointmentUi.profileAgentId = id; renderNipr('profile'); };
    window.lsNiprQueueFilter = function () {
        const status = document.getElementById('nipr-queue-status');
        const search = document.getElementById('nipr-queue-search');
        if (status) appointmentUi.queueStatus = status.value;
        if (search) appointmentUi.queueSearch = search.value;
        renderNipr('queue');
        const nextSearch = document.getElementById('nipr-queue-search');
        if (nextSearch && appointmentUi.queueSearch) {
            nextSearch.focus();
            nextSearch.setSelectionRange(appointmentUi.queueSearch.length, appointmentUi.queueSearch.length);
        }
    };
    window.lsToggleNipr = toggleNipr;

    function renderNipr(view) {
        appointmentUi.subview = view || appointmentUi.subview || 'evaluate';
        setActions('<span class="ls-badge ls-badge-pending"><i class="fa-solid fa-flask"></i> Simulated outbox only</span>');
        const content = appointmentUi.subview === 'evaluate' ? renderAppointmentEvaluate()
            : appointmentUi.subview === 'profile' ? renderAppointmentProfile()
                : appointmentUi.subview === 'queue' ? renderAppointmentQueue()
                    : appointmentUi.subview === 'matrix' ? renderAppointmentMatrix()
                        : renderAppointmentLedger();
        setContent(`
            <section class="nipr-workspace" aria-label="NIPR appointment operations workspace">
                <div class="nipr-workspace-banner"><div><strong>NIPR appointment operations</strong><p>Uses protected licensing records and the configured A&H workbook. No live NIPR PDB, EAR, state DOI, payment, or accounting integration is connected.</p></div><span>Appointment outcomes remain advisory-only; license failures remain hard blocks.</span></div>
                <nav class="nipr-subnav" aria-label="Appointment workspace views">
                    ${appointmentSubviewButton('evaluate', 'Evaluate', 'fa-shield-halved')}
                    ${appointmentSubviewButton('profile', 'Producer compliance', 'fa-user-shield')}
                    ${appointmentSubviewButton('queue', 'Operations queue', 'fa-list-check')}
                    ${appointmentSubviewButton('matrix', 'State & LOA matrix', 'fa-table-list')}
                    ${appointmentSubviewButton('ledger', 'Commission & audit', 'fa-receipt')}
                </nav>
                ${content}
            </section>
        `);
    }

    function toggleNipr(agentId, state, currentlyAppointed) {
        const before = (data.niprAppointments || []).find(n => n.agentId === agentId && n.state === state);
        if (currentlyAppointed) {
            if (before) {
                before.status = 'Terminated';
                before.terminatedAt = new Date().toISOString();
                before.verifiedSource = 'Operator-reviewed workspace action; not externally confirmed';
            }
            logAudit('NIPR_TERM_REVIEWED', `Recorded reviewed termination for agent ${agentId} in ${state}; no live NIPR confirmation.`, agentId, before, before);
        } else {
            let existing = before;
            if (existing) {
                existing.status = 'Appointed';
                existing.date = new Date().toISOString();
                existing.verifiedSource = 'Operator-reviewed workspace action; not externally confirmed';
                logAudit('NIPR_APPT_REVIEWED', `Recorded reviewed appointment status for agent ${agentId} in ${state}; no live NIPR confirmation.`, agentId);
            } else {
                let n = { id: generateId('N'), agentId, state, status: 'Appointed', date: new Date().toISOString(), verifiedSource: 'Operator-reviewed workspace action; not externally confirmed' };
                data.niprAppointments.push(n);
                logAudit('NIPR_APPT_REVIEWED', `Recorded reviewed appointment status for agent ${agentId} in ${state}; no live NIPR confirmation.`, agentId, null, n);
            }
        }
        saveState();
        renderNipr('profile');
    }

    function renderDocs() {
        let html = '<div class="card"><div class="card-header"><div class="card-title">Document Templates</div></div><div class="card-body"><div class="form-grid">';
        (data.documentTemplates || []).forEach(t => {
            html += `
            <div class="method-card" onclick="lsViewDoc('${safeActionId(t.id)}')">
                <div class="title"><i class="fa-solid fa-file-contract" style="color:var(--tinubu-teal)"></i> ${escapeHtml(t.title)}</div>
                <div class="desc">${escapeHtml(t.description || 'Global template')}</div>
            </div>
            `;
        });
        html += '</div></div></div>';
        
        html += '<div class="card" style="margin-top:16px;"><div class="card-header"><div class="card-title">Global Documents</div></div><table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Date</th></tr></thead><tbody>';
        (data.documents || []).forEach(d => {
            html += `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.type || d.category || d.mimeType || 'Compliance document')}</td><td>${escapeHtml(d.uploadDate || d.date || '')}</td></tr>`;
        });
        if ((data.documents || []).length === 0) html += '<tr><td colspan="3" style="text-align:center;">No global documents</td></tr>';
        html += '</tbody></table></div>';
        
        setContent(html);
    }

    window.lsViewDoc = function(id) {
        let t = (data.documentTemplates || []).find(x => x.id === id);
        const name = t ? t.title : 'Document';
        showModal(name, `
            <div class="ls-doc-sheet" style="max-height:60vh; overflow-y:auto; width: 100%; border:none; box-shadow:none;">
                <div class="ls-doc-header-banner">
                    <div class="ls-doc-title" style="color:white; margin:0;">${escapeHtml(name)}</div>
                </div>
                <div style="white-space:pre-wrap;">${t && t.contentHtml ? escapeHtml(t.contentHtml) : 'Document content is not available.'}</div>
            </div>
        `);
    };

    window.lsSaveNote = function() {
        let note = document.getElementById('ls-s-note').value;
        if(note) {
            let n = { date: new Date().toISOString(), text: note };
            data.notes.push(n);
            document.getElementById('ls-s-note').value = '';
            logAudit('ADD_NOTE', 'Added global compliance note', null, null, n);
            saveState();
            renderSettings();
        }
    };

    function renderSettings() {
        setContent(`
            <div class="card">
                <div class="card-header"><div class="card-title">Global Notes</div></div>
                <div class="card-body">
                    <textarea class="form-control" id="ls-s-note" rows="3" placeholder="Add a new global compliance note..."></textarea>
                    <button class="btn btn-secondary" style="margin-top:10px;" onclick="lsSaveNote()">Add Note</button>
                    
                    <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; max-height:200px; overflow-y:auto;">
                        ${data.notes.slice().reverse().map(n => `
                            <div style="margin-bottom:10px; font-size:11px;">
                                <div style="color:var(--tinubu-text-muted); font-weight:bold;">${escapeHtml(new Date(n.date).toLocaleString())}</div>
                                <div>${escapeHtml(n.text)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="card" style="margin-top: 20px;">
                <div class="card-header"><div class="card-title">Full Audit Log</div></div>
                <div class="card-body" style="padding:0; max-height:400px; overflow-y:auto;">
                    <table class="data-table">
                        <thead><tr><th>Timestamp</th><th>Action</th><th>Entity ID</th><th>Details</th></tr></thead>
                        <tbody>
                            ${data.auditLogs.map(a => `
                                <tr>
                                    <td style="white-space:nowrap; width:150px;">${escapeHtml(new Date(a.timestamp).toLocaleString())}</td>
                                    <td style="font-weight:bold; width:180px;">${escapeHtml(a.action)}</td>
                                    <td>${escapeHtml(a.entityId || '-')}</td>
                                    <td>${escapeHtml(a.details)}</td>
                                </tr>
                            `).join('')}
                            ${data.auditLogs.length === 0 ? '<tr><td colspan="4" style="text-align:center;">No activity</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    }

    // Init process
    let initializationStarted = false;
    async function initialize() {
        if (initializationStarted) return;
        initializationStarted = true;
        await loadState();
        // The HTML workspace is usable without a UI sign-in gate. Protected
        // licensing data stays empty/offline until an API session is present.
        injectUI();
        syncCRM();
        initialized = true;
    }
    window.addEventListener('DOMContentLoaded', initialize);
    window.addEventListener('storage', event => {
        if (event.key !== LS_KEY || !event.newValue) return;
        try {
            const incoming = JSON.parse(event.newValue);
            const localAudit = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            const incomingAudit = Array.isArray(incoming.auditLogs) ? incoming.auditLogs : [];
            const seen = new Set(incomingAudit.map(item => item.id));
            localAudit.forEach(item => { if (!seen.has(item.id)) incomingAudit.push(item); });
            incoming.auditLogs = incomingAudit.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
            data = incoming;
            normalizeState();
            syncCRM();
            const view = document.getElementById('view-licensing');
            if (view && view.classList.contains('active')) renderDashboard();
        } catch (_) {}
    });
    
    // Fallback for late script execution
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => {
            initialize();
        }, 1);
    }
    // cloud-sync may restore its cache before this module is registered.
    // Re-requesting hydration merges cached Sheet licensing rows without
    // replacing locally registered modules.
    window.dispatchEvent(new Event('stop-loss-licensing-ready'));
})();