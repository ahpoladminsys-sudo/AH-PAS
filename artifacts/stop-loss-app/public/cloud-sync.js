(function () {
    'use strict';

    var email = 'ahpoladminsys@gmail.com';
    var workspaceLinks = window.STOP_LOSS_WORKSPACE_LINKS || {};
    var currentStatus = null;
    var driveDocumentsCache = null;
    var cloudSyncState = {
        session: { status: 'Checking', detail: 'Checking the secure workspace session.' },
        authorization: { status: 'Checking', detail: 'Checking workspace authorization configuration.' },
        applicationAuthorization: { status: 'Checking', detail: 'Checking signed-in application access.' },
        github: { status: 'Checking', detail: 'Checking the Clerk sign-in provider.' },
        repository: { status: 'Checking', detail: 'Checking the configured GitHub source repository.' },
        sheets: { status: 'Checking', detail: 'Checking Google Sheets access.' },
        drive: { status: 'Checking', detail: 'Checking Google Drive access.' },
        workspace: { status: 'Checking', detail: 'Checking durable workspace state.' },
        email: { status: 'Activity log only', detail: 'Email activity is recorded in System Log; no mail connector is configured.' },
        lastCheckedAt: null
    };
    var WORKSPACE_STATE_CACHE_KEY = 'tinubu-workspace-state-meta-v1';
    var workspaceStateMeta = {};
    var workspaceStateTimer = null;
    var workspaceStateInFlight = false;
    var workspaceStateQueued = false;
    var workspaceStateRemote = null;
    try { workspaceStateMeta = JSON.parse(localStorage.getItem(WORKSPACE_STATE_CACHE_KEY) || '{}') || {}; } catch (_) { workspaceStateMeta = {}; }
    var savedSheetUrl = '';
    try { savedSheetUrl = localStorage.getItem('stop-loss-sheet-url') || workspaceLinks.activeWorkbookUrl || ''; } catch (_) { savedSheetUrl = workspaceLinks.activeWorkbookUrl || ''; }
    var portablePopup = null;
    var portableNonce = '';
    var cloudAuthBlocked = false;
    var PENDING_SYNC_OUTBOX_KEY = 'tinubu-pending-sync-outbox-v1';
    var pendingSyncOutbox = [];
    var pendingSyncInFlight = false;
    var workspaceStateOperationId = '';
    var statusRetryTimer = null;
    var statusRetryAttempt = 0;
    try {
        var savedOutbox = JSON.parse(localStorage.getItem(PENDING_SYNC_OUTBOX_KEY) || '[]');
        if (Array.isArray(savedOutbox)) pendingSyncOutbox = savedOutbox.filter(function (item) {
            return item && item.operationId && item.kind && item.payload;
        });
    } catch (_) { pendingSyncOutbox = []; }

    var cloudAuthorizationReady = false;
    var sheetsRevision = '';
    var sheetsOperationId = '';

    function newOperationId(prefix) {
        var random = window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : new Date().getTime().toString(36) + '-' + Math.random().toString(36).slice(2);
        return String(prefix || 'sync') + '-' + random;
    }
    function savePendingSyncOutbox() {
        try { localStorage.setItem(PENDING_SYNC_OUTBOX_KEY, JSON.stringify(pendingSyncOutbox)); } catch (_) {
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_OUTBOX_STORAGE_FAILED', 'Failed', 'The pending cloud changes could not be saved in this browser. The current in-memory changes remain active.', { source: 'Pending sync outbox' });
            }
        }
        window.dispatchEvent(new CustomEvent('tinubu:pending-sync-changed', { detail: pendingSyncSnapshot() }));
    }
    function pendingSyncSnapshot() {
        return pendingSyncOutbox.map(function (item) {
            var copy = {};
            Object.keys(item).forEach(function (key) { if (key !== 'payload') copy[key] = item[key]; });
            return copy;
        });
    }
    function pendingSyncState() {
        return {
            items: pendingSyncSnapshot(),
            pending: pendingSyncOutbox.filter(function (item) { return item.status === 'pending' || item.status === 'retry' || item.status === 'reconciling'; }).length,
            review: pendingSyncOutbox.filter(function (item) { return item.status === 'review'; }).length,
            completed: pendingSyncOutbox.filter(function (item) { return item.status === 'completed'; }).length
        };
    }
    function queuePendingSync(item) {
        item = item || {};
        var operationId = item.operationId || newOperationId(item.kind || 'sync');
        var targetKey = item.targetKey || '';
        var existingIndex = pendingSyncOutbox.findIndex(function (candidate) {
            return candidate.operationId === operationId || (targetKey && candidate.targetKey === targetKey && candidate.status !== 'completed');
        });
        var previous = existingIndex >= 0 ? pendingSyncOutbox[existingIndex] : null;
        var record = Object.assign({}, previous || {}, item, {
            operationId: operationId,
            status: item.status || (previous && previous.status === 'review' ? 'review' : 'pending'),
            attempts: Number(item.attempts || (previous && previous.attempts) || 0),
            createdAt: (previous && previous.createdAt) || item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        if (existingIndex >= 0) pendingSyncOutbox[existingIndex] = record;
        else pendingSyncOutbox.push(record);
        if (pendingSyncOutbox.length > 100) {
            pendingSyncOutbox = pendingSyncOutbox.filter(function (candidate) { return candidate.status !== 'completed'; }).slice(-100);
        }
        savePendingSyncOutbox();
        if (item.kind !== 'workspace_state' && window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
            window.TinubuSystemLog.recordCloudEvent('CLOUD_SYNC_QUEUED', 'Pending', 'A non-destructive cloud change was retained in the local pending-sync outbox.', {
                operationId: operationId,
                source: 'Pending sync outbox',
                service: item.service || 'cloud',
                state: record.status,
                reason: item.reason || 'Protected cloud access was unavailable.'
            });
        }
        return operationId;
    }
    function updatePendingSync(operationId, changes) {
        var index = pendingSyncOutbox.findIndex(function (item) { return item.operationId === operationId; });
        if (index < 0) return;
        pendingSyncOutbox[index] = Object.assign({}, pendingSyncOutbox[index], changes, { updatedAt: new Date().toISOString() });
        if (changes.status === 'completed') pendingSyncOutbox[index].payload = null;
        savePendingSyncOutbox();
    }
    function queueableCloudFailure(error) {
        return !!error && (error.status === 401 || error.status === 403 || error.status === 409 || error.status >= 500 || !error.status);
    }
    function isTransientCloudFailure(error) {
        var code = errorCode(error);
        return !isAuthorizationFailure(error) && (error.status >= 500 || !error.status || code === 'GOOGLE_RATE_LIMITED' || code === 'GOOGLE_PROVIDER_UNAVAILABLE');
    }
    function outboxProviderReady(kind) {
        var authorization = cloudSyncState.authorization || {};
        var session = cloudSyncState.session || {};
        var sheets = cloudSyncState.sheets || {};
        var drive = cloudSyncState.drive || {};
        if (authorization.status !== 'Configured' || cloudAuthBlocked) return false;
        if (window.STOP_LOSS_IS_FILE && session.status !== 'Connected') return false;
        if ((kind === 'sheets_sync') && (!/connected/i.test(String(sheets.status)) || !sheets.metadata || !sheets.metadata.writable)) return false;
        if (kind !== 'sheets_sync' && !/connected/i.test(String(drive.status))) return false;
        return true;
    }
    function replayPendingItem(item) {
        var payload = item.payload || {};
        var request;
        if (!outboxProviderReady(item.kind)) {
            var blocked = new Error(item.kind === 'sheets_sync'
                ? 'Google Sheets write access is not verified; the pending change remains protected.'
                : 'Protected Google Drive access is not verified; the pending change remains protected.');
            blocked.outboxReview = item.kind === 'sheets_sync'
                && (!(item.expectedRevision || payload.expectedRevision) || !(cloudSyncState.sheets && cloudSyncState.sheets.metadata && cloudSyncState.sheets.metadata.writable));
            return Promise.reject(blocked);
        }
        if (item.kind === 'sheets_sync') {
            var expectedRevision = item.expectedRevision || payload.expectedRevision;
            if (!expectedRevision) {
                var revisionError = new Error('Pull the latest Google Sheets workbook before retrying this pending change.');
                revisionError.outboxReview = true;
                return Promise.reject(revisionError);
            }
            request = api('/sheets/sync', { method: 'POST', body: JSON.stringify({ tabs: payload.tabs, expectedRevision: expectedRevision }) });
        } else if (item.kind === 'workspace_state') {
            request = api('/drive/workspace-state', { method: 'PUT', body: JSON.stringify({ state: payload.state, expectedModifiedTime: payload.expectedModifiedTime || null }) });
        } else if (item.kind === 'drive_update') {
            request = api('/drive/documents/' + encodeURIComponent(payload.fileId) + '/content', {
                method: 'PUT',
                body: JSON.stringify({ contentBase64: payload.contentBase64, expectedModifiedTime: payload.expectedModifiedTime || '' })
            });
        } else if (item.kind === 'enrollment_workbook') {
            request = api('/drive/enrollment-workbook', { method: 'POST', body: JSON.stringify(payload) });
        } else if (item.kind === 'drive_upload') {
            request = api('/drive/documents', { method: 'POST', body: JSON.stringify(payload) });
        } else {
            var unknown = new Error('Unsupported pending cloud operation.');
            unknown.outboxReview = true;
            return Promise.reject(unknown);
        }
        return request.then(function (response) {
            if (item.kind === 'sheets_sync' && response.revision) sheetsRevision = response.revision;
            if (item.kind === 'workspace_state' && response.fileId) {
                workspaceStateRemote = response;
                workspaceStateMeta.fileId = response.fileId;
                workspaceStateMeta.modifiedTime = response.modifiedTime;
                setWorkspaceStateStatus('Drive durable', 'Reconciled after protected cloud recovery.');
            }
            if (item.kind === 'enrollment_workbook' && response.id) {
                var policies = window.TINUBU && window.TINUBU.policies || [];
                var policy = policies.filter(function (candidate) { return candidate.id === payload.policyId; })[0];
                if (policy) {
                    policy.enrollmentWorkbook = Object.assign({}, policy.enrollmentWorkbook || {}, {
                        fileId: response.id, name: response.name, mimeType: response.mimeType,
                        webViewLink: response.webViewLink, modifiedTime: response.modifiedTime,
                        folderId: response.folderId, folderPath: response.folderPath,
                        lastUploadId: response.uploadId, lastReportMonth: response.reportMonth,
                        lastChangedAt: response.lastChangedAt, lastChangeDescription: response.changeDescription
                    });
                    window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'pending-enrollment-reconciled' } }));
                }
            }
            return response;
        });
    }
    function reconcilePendingSync() {
        if (pendingSyncInFlight || !pendingSyncOutbox.some(function (item) { return item.status === 'pending' || item.status === 'retry'; })) return Promise.resolve([]);
        pendingSyncInFlight = true;
        var results = [];
        var next = Promise.resolve();
        pendingSyncOutbox.filter(function (item) { return item.status === 'pending' || item.status === 'retry'; }).forEach(function (item) {
            next = next.then(function () {
                if (cloudAuthBlocked) return null;
                updatePendingSync(item.operationId, { status: 'reconciling' });
                return replayPendingItem(item).then(function (response) {
                    updatePendingSync(item.operationId, { status: 'completed', completedAt: new Date().toISOString(), lastError: null });
                    if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                        window.TinubuSystemLog.recordCloudEvent('CLOUD_SYNC_RECONCILED', 'Completed', 'A pending cloud change was reconciled after protected access was verified.', { operationId: item.operationId, source: 'Pending sync outbox', service: item.service || item.kind });
                    }
                    results.push({ operationId: item.operationId, status: 'completed', response: response });
                    return response;
                }).catch(function (error) {
                    var review = !!error.outboxReview || error.isConflict || error.status === 409;
                    var blocked = isAuthorizationFailure(error);
                    var nextStatus = review ? 'review' : 'retry';
                    updatePendingSync(item.operationId, {
                        status: nextStatus,
                        attempts: Number(item.attempts || 0) + 1,
                        lastError: error.message || 'Pending cloud reconciliation failed.',
                        nextAttemptAt: isTransientCloudFailure(error) ? new Date(Date.now() + Math.min(300000, 1000 * Math.pow(2, Number(item.attempts || 0)))).toISOString() : null
                    });
                    if (blocked) cloudAuthBlocked = true;
                    if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                        window.TinubuSystemLog.recordCloudEvent('CLOUD_SYNC_RECONCILIATION_' + (review ? 'REVIEW' : 'FAILED'), review ? 'Pending review' : 'Failed', error.message || 'Pending cloud reconciliation failed.', { operationId: item.operationId, source: 'Pending sync outbox', service: item.service || item.kind, attempt: Number(item.attempts || 0) + 1 });
                    }
                    results.push({ operationId: item.operationId, status: nextStatus, error: error.message });
                    if (blocked) return null;
                    return null;
                });
            });
        });
        return next.then(function () { pendingSyncInFlight = false; return results; }, function (error) { pendingSyncInFlight = false; throw error; });
    }

    function errorCode(error) {
        return error && error.body && typeof error.body.code === 'string' ? error.body.code : '';
    }
    function updateCloudState(service, status, detail, metadata, eventStatus, skipEvent) {
        var previous = cloudSyncState[service] || {};
        var nextStatus = status || 'Unknown';
        var nextDetail = detail || '';
        var changed = previous.status !== nextStatus || previous.detail !== nextDetail;
        var wasConnected = /connected|hosted|durable/i.test(String(previous.status || ''));
        var isDisconnected = /unauthorized|failed|unavailable|offline|not connected|session required|api origin needed|browser fallback|conflict|expired/i.test(String(nextStatus));
        cloudSyncState[service] = {
            status: nextStatus,
            detail: nextDetail,
            checkedAt: new Date().toISOString(),
            metadata: metadata || {}
        };
        cloudSyncState.lastCheckedAt = cloudSyncState[service].checkedAt;
        if (changed && !skipEvent && window.TinubuSystemLog && typeof window.TinubuSystemLog.updateCloudConnection === 'function') {
            window.TinubuSystemLog.updateCloudConnection(service, status, detail, metadata, eventStatus);
            if (wasConnected && isDisconnected && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_DISCONNECTION', 'Warning', String(service || 'Cloud service') + ' disconnected: ' + nextStatus + (nextDetail ? ' · ' + nextDetail : ''), Object.assign({ service: service || 'cloud', previousStatus: previous.status || 'Connected', currentStatus: nextStatus }, metadata || {}));
            }
        }
        var render = window.TinubuSystemLog && window.TinubuSystemLog.render;
        var view = document.getElementById('view-system-log');
        if (typeof render === 'function' && view && view.classList.contains('active')) render();
        if (changed) window.dispatchEvent(new CustomEvent('tinubu:cloud-state-changed', {
            detail: { service: service, status: nextStatus, detail: nextDetail }
        }));
    }

    function notify(text, bad, options) {
        options = options || {};
        var detail = String(text == null ? '' : text);
        if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function' && !options.skipLog) {
            window.TinubuSystemLog.recordCloudEvent(options.action || 'CLOUD_OPERATION', bad ? 'Failed' : 'Completed', detail, options.metadata || {});
        }
        if (window.showTinubuNotice && !options.silent) window.showTinubuNotice(detail, !!bad);
        var surface = document.getElementById('system-cloud-message');
        if (surface) {
            surface.textContent = detail;
            surface.className = bad ? 'bad' : '';
            surface.hidden = false;
        }
    }

    function api(path, options) {
        options = options || {};
        options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        var request = typeof window.stopLossApiFetch === 'function'
            ? window.stopLossApiFetch(path, options)
            : fetch(window.stopLossApiUrl ? window.stopLossApiUrl(path) : '/api' + path, options);
        return request.then(function (response) {
            return response.text().then(function (text) {
                var body;
                try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
                if (!response.ok) {
                    var failure = new Error(body.error || ('Request failed (' + response.status + ')'));
                    failure.status = response.status;
                    failure.body = body;
                    if (body && body.expectedModifiedTime) failure.expectedModifiedTime = body.expectedModifiedTime;
                    if (body && body.actualModifiedTime) failure.actualModifiedTime = body.actualModifiedTime;
                    failure.isConflict = response.status === 409 || /changed in Google Drive|conflict/i.test(failure.message || '');
                    if (isAuthorizationFailure(failure)) cloudAuthBlocked = true;
                    if (!isAuthorizationFailure(failure) && window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                        window.TinubuSystemLog.recordCloudEvent('CLOUD_API_FAILURE', response.status === 401 ? 'Unauthorized' : 'Failed', failure.message, { path: path, status: response.status, code: errorCode(failure) || null });
                    }
                    throw failure;
                }
                return body;
            });
        });
    }

    function refreshPortableSessionState() {
        var token = '';
        try { token = sessionStorage.getItem('tinubu-portable-session-v1') || ''; } catch (_) {}
        cloudSyncState.session = window.STOP_LOSS_IS_FILE
            ? { status: token ? 'Connected' : (window.STOP_LOSS_API_ORIGIN ? 'Not connected' : 'API origin needed'), detail: token ? 'Downloaded workspace is using a short-lived secure session.' : 'Set the hosted API origin, then connect a short-lived secure session.' }
            : { status: token ? 'Connected' : 'Hosted sign-in available', detail: token ? 'Hosted workspace is using a short-lived secure application session.' : 'Use Sign in / reconnect to open the secure hosted sign-in handoff.' };
        updateCloudState('session', cloudSyncState.session.status, cloudSyncState.session.detail, { portable: !!window.STOP_LOSS_IS_FILE, hasSession: !!token }, 'Completed');
    }

    function connectPortableSession() {
        if (!window.STOP_LOSS_API_ORIGIN) {
            notify('Set the hosted API origin before connecting the downloaded workspace.', true);
            return;
        }
        return api('/auth/portable/start', { method: 'POST', body: '{}' }).then(function (result) {
            portableNonce = result.nonce;
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('APPLICATION_SIGN_IN_ATTEMPT', 'Started', 'Opened the secure Clerk sign-in handoff with GitHub available as an application provider.', {
                    mode: window.STOP_LOSS_IS_FILE ? 'Downloaded HTML' : 'Hosted app',
                    provider: 'github',
                    dedupeKey: 'application-sign-in-attempt|' + (window.STOP_LOSS_IS_FILE ? 'portable' : 'hosted'),
                    dedupeWindowMs: 15000
                });
            }
            portablePopup = window.open(result.authorizeUrl, 'tinubu-portable-auth', 'popup,width=540,height=760');
            if (!portablePopup) {
                if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                    window.TinubuSystemLog.recordCloudEvent('APPLICATION_SIGN_IN_POPUP_BLOCKED', 'Failed', 'The secure application sign-in window was blocked by the browser.', {
                        mode: window.STOP_LOSS_IS_FILE ? 'Downloaded HTML' : 'Hosted app',
                        provider: 'github',
                        dedupeKey: 'application-sign-in-popup-blocked|' + (window.STOP_LOSS_IS_FILE ? 'portable' : 'hosted'),
                        dedupeWindowMs: 300000
                    });
                }
                throw new Error('The sign-in window was blocked. Allow pop-ups for this file and try again.');
            }
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_SESSION_CONNECT_ATTEMPT', 'Started', 'Started a secure cloud sign-in handoff.', { mode: window.STOP_LOSS_IS_FILE ? 'Downloaded HTML' : 'Hosted app' });
            }
            notify('Complete sign-in in the secure hosted window. This workspace will receive only a short-lived application session.');
        }).catch(function (error) { notify(error.message, true); });
    }

    function connectHostedSession() {
        return connectPortableSession();
    }

    function reconnectGoogleAccess() {
        return connectHostedSession();
    }

    window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type !== 'tinubu-portable-session' || data.nonce !== portableNonce) return;
        if (event.origin !== window.STOP_LOSS_API_ORIGIN || !data.sessionToken) return;
        try { sessionStorage.setItem('tinubu-portable-session-v1', data.sessionToken); } catch (_) {}
        portableNonce = '';
        if (portablePopup && !portablePopup.closed) portablePopup.close();
        refreshPortableSessionState();
        if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
            window.TinubuSystemLog.recordCloudEvent('CLOUD_SESSION_HANDOFF', 'Completed', 'Secure cloud session handoff completed.', { mode: window.STOP_LOSS_IS_FILE ? 'Downloaded HTML' : 'Hosted app' });
            window.TinubuSystemLog.recordCloudEvent('APPLICATION_SESSION_CONNECTED', 'Completed', 'The secure Clerk application session handoff completed.', {
                mode: window.STOP_LOSS_IS_FILE ? 'Downloaded HTML' : 'Hosted app',
                dedupeKey: 'application-session-connected|' + (window.STOP_LOSS_IS_FILE ? 'portable' : 'hosted'),
                dedupeWindowMs: 300000
            });
        }
        notify('Cloud session connected. Checking Sheets, Drive, Gemini, and licensing access.');
        refreshStatus().then(function () {
            if (cloudAuthBlocked) return;
            loadWorkspaceState();
            pullAndHydrate({ silent: true }).catch(function () {});
        });
    });

    window.addEventListener('tinubu:portable-session-expired', function () {
        refreshPortableSessionState();
        if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
            window.TinubuSystemLog.recordCloudEvent('CLOUD_SESSION_EXPIRED', 'Expired', 'The short-lived portable cloud session expired.', { mode: 'Downloaded HTML' });
            window.TinubuSystemLog.recordCloudEvent('APPLICATION_SESSION_EXPIRED', 'Expired', 'The short-lived application session expired and protected access was paused.', {
                mode: 'Downloaded HTML',
                code: 'PORTABLE_SESSION_EXPIRED',
                dedupeKey: 'application-session-expired|portable',
                dedupeWindowMs: 300000
            });
        }
        notify('The portable cloud session expired. Connect again to continue cloud access.', true);
        refreshStatus();
    });

    function clean(value) {
        return JSON.parse(JSON.stringify(value == null ? [] : value, function (_, item) {
            return typeof item === 'function' || typeof item === 'undefined' ? null : item;
        }));
    }

    function setWorkspaceStateStatus(status, detail) {
        workspaceStateMeta.status = status;
        workspaceStateMeta.detail = detail || '';
        try { localStorage.setItem(WORKSPACE_STATE_CACHE_KEY, JSON.stringify(workspaceStateMeta)); } catch (_) {}
        updateCloudState('workspace', status, detail, { fileId: workspaceStateMeta.fileId || null }, status === 'Browser fallback' ? 'Warning' : 'Completed', status === 'Drive durable');
        window.dispatchEvent(new CustomEvent('tinubu:workspace-state-status', { detail: workspaceStateMeta }));
    }

    function workspaceStatePayload() {
        var systemLog = window.TinubuSystemLog && window.TinubuSystemLog.snapshot
            ? window.TinubuSystemLog.snapshot() : { indexFiles: [], events: [] };
        var pendingReview = window.TinubuSystemLog && window.TinubuSystemLog.pendingReview
            ? window.TinubuSystemLog.pendingReview() : { indexReview: null, disableIndexId: null };
        var licensing = window.LicensingSuite && window.LicensingSuite.snapshot
            ? window.LicensingSuite.snapshot() : null;
        var cachedTabs = [];
        try { cachedTabs = JSON.parse(localStorage.getItem('stop-loss-sheet-workspace') || '[]'); } catch (_) {}
        return {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            source: 'Tinubu Stop Loss standalone workspace',
            systemLog: clean(systemLog),
            pendingReview: clean(pendingReview),
            sheetsCache: { tabs: clean(Array.isArray(cachedTabs) ? cachedTabs : (window.__STOP_LOSS_SHEETS_SNAPSHOT || [])), cachedAt: new Date().toISOString(), writable: false },
            aiPromptProfiles: window.AIUploadPrompts && window.AIUploadPrompts.snapshot
                ? clean(window.AIUploadPrompts.snapshot()) : null,
            licensingFallback: licensing ? { state: clean(licensing), capturedAt: new Date().toISOString(), authoritative: false } : null,
            canonicalIndex: window.TinubuIndex && window.TinubuIndex.canonical
                ? clean(Object.assign({}, window.TinubuIndex.canonical, {
                    tabs: window.TINUBU_INDEX_DATA && window.TINUBU_INDEX_DATA.tabs || []
                })) : null,
            activeIndexSource: window.TinubuIndex && typeof window.TinubuIndex.activeSource === 'function'
                ? clean(window.TinubuIndex.activeSource()) : null
        };
    }

    function hydrateWorkspaceState(state) {
        if (!state || Number(state.schemaVersion) !== 1) return false;
        if (window.TinubuSystemLog && typeof window.TinubuSystemLog.hydrate === 'function') {
            window.TinubuSystemLog.hydrate(state.systemLog, state.pendingReview);
        }
        if (state.canonicalIndex && Array.isArray(state.canonicalIndex.tabs)) {
            var pending = window.TinubuSystemLog && typeof window.TinubuSystemLog.pendingReview === 'function'
                ? window.TinubuSystemLog.pendingReview().indexReview : null;
            var active = window.TinubuIndex && typeof window.TinubuIndex.activeSource === 'function'
                ? window.TinubuIndex.activeSource() : null;
            if (!pending || !active || !state.canonicalIndex.source || state.canonicalIndex.source.id === active.sourceId) {
                var canonicalSource = state.canonicalIndex.source || {};
                var hydratedIndex = {
                    sourceFile: canonicalSource.file || '',
                    sourceId: canonicalSource.id || '',
                    sourceKind: canonicalSource.kind || 'Drive durable workspace state',
                    sourceModifiedAt: canonicalSource.modifiedAt || '',
                    driveFileId: canonicalSource.driveFileId || '',
                    tabs: state.canonicalIndex.tabs,
                    unavailableLookups: state.canonicalIndex.unavailable || [],
                    canonicalMetadata: state.canonicalIndex.provenance || {}
                };
                if (window.TinubuIndex && typeof window.TinubuIndex.refresh === 'function') window.TinubuIndex.refresh(hydratedIndex);
            }
        }
        if (state.sheetsCache && Array.isArray(state.sheetsCache.tabs)) hydrateTabs(state.sheetsCache.tabs);
        if (state.aiPromptProfiles && window.AIUploadPrompts && typeof window.AIUploadPrompts.hydrate === 'function') {
            window.AIUploadPrompts.hydrate(state.aiPromptProfiles);
        }
        if (state.licensingFallback && state.licensingFallback.state && !window.__tinubuLicensingAuthoritative
            && window.LicensingSuite && typeof window.LicensingSuite.hydrate === 'function') {
            window.LicensingSuite.hydrate(state.licensingFallback.state);
        }
        return true;
    }

    function loadWorkspaceState() {
        if (!cloudAuthorizationReady || cloudAuthBlocked) return Promise.resolve(null);
        return api('/drive/workspace-state').then(function (result) {
            workspaceStateRemote = result;
            workspaceStateMeta.fileId = result.fileId;
            workspaceStateMeta.modifiedTime = result.modifiedTime;
            hydrateWorkspaceState(result.state);
            setWorkspaceStateStatus('Drive durable', 'Recovered from Google Drive');
            return result;
        }).catch(function (error) {
            if (error && /404|No managed workspace/i.test(error.message || '')) {
                setWorkspaceStateStatus('Not created', 'A managed Drive state file will be created after the next authorized save.');
            } else if (error && /401|Unauthorized/i.test(error.message || '')) {
                setWorkspaceStateStatus('Session required', 'Protected Drive state is unavailable without an authenticated session.');
            } else {
                setWorkspaceStateStatus('Browser fallback', 'Drive state is temporarily unavailable; localStorage remains active.');
            }
            return null;
        });
    }

    function persistWorkspaceState(options) {
        options = options || {};
        if (!cloudAuthorizationReady || cloudAuthBlocked) {
            if (!workspaceStateOperationId) workspaceStateOperationId = newOperationId('workspace-state');
            queuePendingSync({
                operationId: workspaceStateOperationId,
                targetKey: 'workspace-state',
                kind: 'workspace_state',
                service: 'drive',
                target: { fileId: workspaceStateMeta.fileId || null, folderPath: ['Tinubu Stop Loss System'] },
                expectedModifiedTime: workspaceStateMeta.modifiedTime || null,
                payload: { state: workspaceStatePayload(), expectedModifiedTime: workspaceStateMeta.modifiedTime || null },
                reason: 'Protected workspace state could not be saved while cloud access was unavailable.'
            });
            setWorkspaceStateStatus('Browser fallback', 'Local storage retained the latest state; Drive save is pending protected recovery.');
            return Promise.resolve(null);
        }
        if (workspaceStateInFlight) {
            workspaceStateQueued = true;
            return Promise.resolve(null);
        }
        workspaceStateInFlight = true;
        var payload = workspaceStatePayload();
        var expected = workspaceStateMeta.modifiedTime || null;
        return api('/drive/workspace-state', {
            method: 'PUT',
            body: JSON.stringify({ state: payload, expectedModifiedTime: expected })
        }).then(function (result) {
            workspaceStateRemote = result;
            workspaceStateMeta.fileId = result.fileId;
            workspaceStateMeta.modifiedTime = result.modifiedTime;
            if (result.movedToSystemFolder && window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                recordDriveEventOnce('DRIVE_SYSTEM_FILE_MOVED', 'Completed', 'Moved the managed workspace-state file into the dedicated System Folder.', {
                    fileId: result.fileId,
                    folderId: result.folderId || '',
                    folderPath: result.folderPath || ['Tinubu Stop Loss System'],
                    reason: 'System-owned workspace state belongs in the managed System Folder.',
                    operationId: result.operationId,
                    decidedAt: result.decidedAt,
                    generatedAt: result.generatedAt,
                    source: 'Workspace-state server response'
                }, 'workspace-state-moved|' + (result.operationId || result.fileId + '|' + (result.decidedAt || result.modifiedTime || '')));
            }
            setWorkspaceStateStatus('Drive durable', 'Updated ' + new Date(result.modifiedTime).toLocaleString());
            workspaceStateOperationId = '';
            return result;
        }).catch(function (error) {
            if (queueableCloudFailure(error)) {
                if (!workspaceStateOperationId) workspaceStateOperationId = newOperationId('workspace-state');
                queuePendingSync({
                    operationId: workspaceStateOperationId,
                    targetKey: 'workspace-state',
                    kind: 'workspace_state',
                    service: 'drive',
                    target: { fileId: workspaceStateMeta.fileId || null, folderPath: ['Tinubu Stop Loss System'] },
                    expectedModifiedTime: expected,
                    payload: { state: payload, expectedModifiedTime: expected },
                    status: error.isConflict ? 'review' : 'pending',
                    reason: error.isConflict ? 'Drive state changed elsewhere and must be reviewed before retrying.' : 'Protected workspace state save failed.'
                });
            }
            if (error && /changed in Google Drive|conflict/i.test(error.message || '')) {
                setWorkspaceStateStatus('Conflict', 'Drive changed elsewhere; reload before saving.');
            } else if (error && /401|Unauthorized/i.test(error.message || '')) {
                setWorkspaceStateStatus('Session required', 'Protected Drive state is unavailable without an authenticated session.');
            } else {
                setWorkspaceStateStatus('Browser fallback', 'Local storage retained the latest state; Drive save will retry.');
            }
            if (!options.silent && window.showTinubuNotice) window.showTinubuNotice('Workspace state could not be saved to Drive. The browser fallback remains active.', true);
            return null;
        }).finally(function () {
            workspaceStateInFlight = false;
            if (workspaceStateQueued) {
                workspaceStateQueued = false;
                queueWorkspaceStateSync();
            }
        });
    }

    function queueWorkspaceStateSync() {
        clearTimeout(workspaceStateTimer);
        workspaceStateTimer = setTimeout(function () {
            persistWorkspaceState({ silent: true });
        }, 900);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function listDriveDocuments(force) {
        if (!force && driveDocumentsCache) return Promise.resolve(driveDocumentsCache);
        return api('/drive/documents').then(function (result) {
            driveDocumentsCache = Array.isArray(result.files) ? result.files : [];
            return driveDocumentsCache;
        });
    }

    function listDriveIndexWorkbooks(force) {
        if (!force && driveDocumentsCache && driveDocumentsCache.__indexWorkbooks) return Promise.resolve(driveDocumentsCache);
        return api('/drive/index-workbooks').then(function (result) {
            var files = Array.isArray(result.files) ? result.files : [];
            files.__indexWorkbooks = true;
            return files;
        });
    }

    function readDriveDocument(id) {
        if (!id) return Promise.reject(new Error('This document is not linked to Google Drive.'));
        return api('/drive/documents/' + encodeURIComponent(id) + '/content');
    }

    function updateDriveDocumentContent(id, contentBase64, expectedModifiedTime, operationId) {
        if (!id || !contentBase64) return Promise.reject(new Error('A Drive file and workbook content are required.'));
        var requestPayload = { fileId: id, contentBase64: contentBase64, expectedModifiedTime: expectedModifiedTime || '' };
        var operation = operationId || newOperationId('drive-update');
        return api('/drive/documents/' + encodeURIComponent(id) + '/content', {
            method: 'PUT',
            body: JSON.stringify({ contentBase64: contentBase64, expectedModifiedTime: expectedModifiedTime || '' })
        }).then(function (file) {
            driveDocumentsCache = null;
            return file;
        }).catch(function (error) {
            if (queueableCloudFailure(error)) {
                queuePendingSync({
                    operationId: operation,
                    targetKey: 'drive-file:' + id,
                    kind: 'drive_update',
                    service: 'drive',
                    target: { fileId: id },
                    expectedModifiedTime: expectedModifiedTime || null,
                    payload: requestPayload,
                    status: error.isConflict ? 'review' : 'pending',
                    reason: error.isConflict ? 'The Drive file changed elsewhere and must be reviewed before retrying.' : 'The Drive document update was retained after protected access failed.'
                });
            }
            throw error;
        });
    }

    function saveEnrollmentWorkbook(input) {
        input = input || {};
        if (!input.policyId || !input.reportMonth || !input.uploadId || !input.contentBase64) {
            return Promise.reject(new Error('Enrollment workbook metadata and content are required.'));
        }
        var requestPayload = {
            name: input.name,
            mimeType: input.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBase64: input.contentBase64,
            policyId: input.policyId,
            folderPath: input.folderPath || [],
            workbookFileId: input.workbookFileId || undefined,
            expectedModifiedTime: input.expectedModifiedTime || undefined,
            uploadId: input.uploadId,
            reportMonth: input.reportMonth,
            lastChangedAt: input.lastChangedAt,
            changeDescription: input.changeDescription
        };
        return api('/drive/enrollment-workbook', {
            method: 'POST',
            body: JSON.stringify(requestPayload)
        }).then(function (file) {
            driveDocumentsCache = null;
            return file;
        }).catch(function (error) {
            if (queueableCloudFailure(error)) {
                queuePendingSync({
                    operationId: input.uploadId,
                    targetKey: 'enrollment:' + input.policyId + ':' + input.reportMonth,
                    kind: 'enrollment_workbook',
                    service: 'drive',
                    target: { fileId: input.workbookFileId || null, policyId: input.policyId, folderPath: input.folderPath || [] },
                    expectedModifiedTime: input.expectedModifiedTime || null,
                    payload: requestPayload,
                    status: error.isConflict ? 'review' : 'pending',
                    reason: error.isConflict ? 'The enrollment workbook changed elsewhere and must be reviewed before retrying.' : 'The enrollment workbook save was retained after protected access failed.'
                });
            }
            throw error;
        });
    }

    function base64Bytes(value) {
        var binary = atob(value || ''), bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function downloadDriveDocument(id) {
        return readDriveDocument(id).then(function (file) {
            var blob = new Blob([base64Bytes(file.contentBase64)], { type: file.mimeType || 'application/octet-stream' });
            var url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url;
            link.download = file.name || 'drive-document';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            notify('Download started for ' + file.name + '.');
            return file;
        }).catch(function (error) {
            notify(error.message, true);
            throw error;
        });
    }

    function openDriveDocument(id) {
        return readDriveDocument(id).then(function (file) {
            var old = document.getElementById('sl-drive-document-viewer');
            if (old) old.remove();
            var mime = file.mimeType || 'application/octet-stream';
            var blob = new Blob([base64Bytes(file.contentBase64)], { type: mime });
            var url = URL.createObjectURL(blob);
            var preview = mime.indexOf('image/') === 0
                ? '<img src="' + url + '" alt="' + escapeHtml(file.name) + '" style="max-width:100%;max-height:58vh;object-fit:contain;">'
                : mime === 'application/pdf' || mime.indexOf('text/') === 0
                    ? '<iframe src="' + url + '" title="' + escapeHtml(file.name) + '" style="width:100%;height:58vh;border:1px solid #d8e4e6;border-radius:6px;background:#fff;"></iframe>'
                    : '<div class="sl-drive-preview-fallback"><strong>This file type is not previewable in the workspace.</strong><p>Open the original in Google Drive or download it to view locally.</p><a class="sl-drive-open" href="' + escapeHtml(file.webViewLink || '#') + '" target="_blank" rel="noopener">Open in Google Drive</a></div>';
            var overlay = document.createElement('div');
            overlay.id = 'sl-drive-document-viewer';
            overlay.className = 'modal-overlay';
            overlay.style.display = 'flex';
            overlay.innerHTML = '<div class="modal-content" style="max-width:900px;"><div class="modal-header"><h3><i class="fa-solid fa-file-lines"></i> ' + escapeHtml(file.name) + '</h3><button class="modal-close" type="button" aria-label="Close">&times;</button></div><div class="modal-body"><div class="sl-drive-preview">' + preview + '</div></div><div class="modal-footer"><button class="btn btn-secondary sl-drive-close" type="button">Close</button><button class="btn btn-primary sl-drive-download" type="button">Download</button></div></div>';
            document.body.appendChild(overlay);
            var close = function () {
                overlay.remove();
                URL.revokeObjectURL(url);
            };
            overlay.querySelector('.modal-close').onclick = close;
            overlay.querySelector('.sl-drive-close').onclick = close;
            overlay.querySelector('.sl-drive-download').onclick = function () { downloadDriveDocument(file.id); };
            return file;
        }).catch(function (error) {
            notify(error.message, true);
            throw error;
        });
    }

    function renderDriveLibrary(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return Promise.resolve([]);
        container.innerHTML = '<div class="sl-drive-library-loading">Loading files saved to Google Drive…</div>';
        return listDriveDocuments().then(function (files) {
            if (!files.length) {
                container.innerHTML = '<div class="sl-drive-library-empty">No files are currently available in Google Drive.</div>';
                return files;
            }
            container.innerHTML = '<div class="sl-drive-library-list">' + files.map(function (file) {
                return '<div class="sl-drive-library-row"><div><strong>' + escapeHtml(file.name) + '</strong><small>' + escapeHtml(file.mimeType || 'Drive file') + (file.modifiedTime ? ' · Updated ' + escapeHtml(new Date(file.modifiedTime).toLocaleDateString()) : '') + '</small></div><div class="sl-drive-library-actions"><button class="btn btn-secondary btn-sm" type="button" data-drive-view="' + escapeHtml(file.id) + '">View</button><button class="btn btn-secondary btn-sm" type="button" data-drive-download="' + escapeHtml(file.id) + '">Download</button></div></div>';
            }).join('') + '</div>';
            container.querySelectorAll('[data-drive-view]').forEach(function (button) {
                button.onclick = function () { openDriveDocument(button.getAttribute('data-drive-view')); };
            });
            container.querySelectorAll('[data-drive-download]').forEach(function (button) {
                button.onclick = function () { downloadDriveDocument(button.getAttribute('data-drive-download')); };
            });
            return files;
        }).catch(function (error) {
            container.innerHTML = '<div class="sl-drive-library-empty">Google Drive files could not be loaded.</div>';
            notify(error.message, true);
            return [];
        });
    }

    function migrationPolicies() {
        var T = window.TINUBU || {};
        return (T.policies || []).map(function (policy) {
            var effective = String(policy.effectiveDate || policy.effective || '');
            var yearMatch = effective.match(/\b(20\d{2})\b/);
            var documentFileIds = (policy.docs || []).map(function (doc) {
                return doc && doc.driveFileId ? String(doc.driveFileId) : '';
            }).filter(Boolean);
            return {
                id: String(policy.id || ''),
                name: String(policy.name || ''),
                effectiveYear: yearMatch ? yearMatch[1] : '',
                documentFileIds: documentFileIds
            };
        }).filter(function (policy) {
            return policy.id && policy.name && /^\d{4}$/.test(policy.effectiveYear);
        });
    }

    function pathLabel(path) {
        return path && path.length ? path.map(escapeHtml).join(' / ') : '<em>Drive root</em>';
    }

    // These events are persisted in the workspace state and can be replayed after
    // a Drive recovery.  A server operation/preview is therefore the identity,
    // rather than the lifetime of the dialog which displayed it.
    function recordDriveEventOnce(action, status, detail, metadata, identity) {
        if (!window.TinubuSystemLog || typeof window.TinubuSystemLog.recordCloudEvent !== 'function') return;
        metadata = Object.assign({
            actor: 'Browser workspace operator',
            source: 'Drive organization controls',
            dedupeKey: 'drive-organization|' + identity,
            dedupeWindowMs: 315360000000
        }, metadata || {});
        window.TinubuSystemLog.recordCloudEvent(action, status, detail, metadata);
    }

    function migrationMetadata(file, operation, timestamp) {
        return {
            previewId: operation && operation.previewId,
            operationId: operation && operation.operationId,
            generatedAt: operation && operation.generatedAt,
            decidedAt: timestamp || (operation && operation.decidedAt),
            fileId: file.sourceFileId,
            fileName: file.sourceName,
            sourceFolderIds: file.sourceParentIds || file.beforeParentIds || [],
            sourceFolderPath: file.sourcePath || file.beforePath || [],
            destinationFolderId: file.destinationFolderId || ((file.afterParentIds || [])[0]) || '',
            destinationFolderPath: file.destinationPath || file.afterPath || [],
            reason: file.reason || file.message || ''
        };
    }

    function duplicateMetadata(file, operation, timestamp) {
        return {
            previewId: operation && operation.previewId,
            operationId: operation && operation.operationId,
            generatedAt: operation && operation.generatedAt,
            decidedAt: timestamp || (operation && operation.decidedAt),
            fileId: file.fileId,
            fileName: file.fileName,
            retainedFileId: file.retainedFileId,
            managedFolderId: file.parentFolderId || (operation && operation.folderId) || '',
            managedFolderPath: file.parentPath || (operation && operation.folderPath) || [],
            reason: file.reason || ''
        };
    }

    function recordMigrationPreview(preview) {
        (preview.files || []).forEach(function (file) {
            recordDriveEventOnce('DRIVE_FOLDER_MOVE_PREVIEW', 'Preview', file.reason || 'Drive folder migration preview recorded.',
                migrationMetadata(file, preview, preview.generatedAt), 'migration-preview|' + preview.previewId + '|' + file.sourceFileId);
        });
    }

    function recordDuplicatePreview(preview) {
        (preview.files || []).forEach(function (file) {
            recordDriveEventOnce('DRIVE_DUPLICATE_PREVIEW', 'Preview', file.reason || 'Drive duplicate cleanup preview recorded.',
                duplicateMetadata(file, preview, preview.generatedAt), 'duplicate-preview|' + preview.previewId + '|' + file.fileId);
        });
    }

    function migrationMoves(preview) {
        return (preview.files || []).filter(function (file) {
            return file.decision === 'proposed';
        }).map(function (file) {
            return {
                sourceFileId: file.sourceFileId,
                destinationPath: file.destinationPath,
                destinationFolderId: file.destinationFolderId || undefined,
                expectedSourceParentIds: file.sourceParentIds || []
            };
        });
    }

    function closeMigrationModal() {
        var modal = document.getElementById('sl-drive-migration-modal');
        if (modal) modal.remove();
    }

    function renderMigrationResult(result) {
        var modal = document.getElementById('sl-drive-migration-modal');
        if (!modal) return;
        modal.setAttribute('data-completed', 'true');
        var rows = (result.results || []).map(function (item) {
            item.reason = item.reason || item.message || 'Approved governed folder migration.';
            item.sourceParentIds = item.beforeParentIds || [];
            item.sourcePath = item.beforePath || [];
            item.destinationFolderId = item.destinationFolderId || (item.afterParentIds || [])[0] || '';
            item.destinationPath = item.destinationPath || item.afterPath || [];
            recordDriveEventOnce('DRIVE_FOLDER_MOVE_DECISION', item.status === 'moved' || item.status === 'already_in_destination' ? 'Completed' : item.status === 'conflict' ? 'Conflict' : 'Failed', item.message || 'Drive folder migration decision recorded.',
                migrationMetadata(item, result, item.decidedAt || result.decidedAt), 'migration-result|' + (result.operationId || result.previewId || '') + '|' + item.sourceFileId + '|' + item.status);
            var status = item.status === 'moved' ? 'Moved' : item.status === 'already_in_destination' ? 'Already organized' : item.status === 'conflict' ? 'Review again' : 'Failed';
            return '<div class="sl-migration-result-row"><div><strong>' + escapeHtml(item.sourceName) + '</strong><small>' + escapeHtml(status) + (item.message ? ' · ' + escapeHtml(item.message) : '') + '</small></div><div class="sl-migration-path"><span>' + pathLabel(item.beforePath) + '</span><b>→</b><span>' + pathLabel(item.afterPath) + '</span></div></div>';
        }).join('');
        recordDriveEventOnce('DRIVE_FOLDER_MOVE_RESULT', 'Completed', 'Drive folder migration returned ' + (result.results || []).length + ' decisions.',
            { previewId: result.previewId, operationId: result.operationId, decidedAt: result.decidedAt, resultCount: (result.results || []).length },
            'migration-result-summary|' + (result.operationId || result.previewId || ''));
        modal.querySelector('.modal-content').innerHTML = '<div class="modal-header"><h3><i class="fa-solid fa-check-circle"></i> Migration results</h3><button class="modal-close" type="button" aria-label="Close">&times;</button></div><div class="modal-body"><div class="sl-migration-summary"><strong>' + escapeHtml(result.movedCount) + ' moved</strong><span>' + escapeHtml(result.alreadyInDestinationCount) + ' already organized</span><span>' + escapeHtml(result.conflictCount) + ' conflicts</span><span>' + escapeHtml(result.failedCount) + ' failed</span></div><p class="sl-migration-note">Each result was logged with its before and after folder references. Sharing permissions were not changed.</p><div class="sl-migration-results">' + (rows || '<div class="sl-drive-library-empty">No approved files were selected.</div>') + '</div></div><div class="modal-footer"><button class="btn btn-primary sl-migration-done" type="button">Done</button></div>';
        modal.querySelector('.modal-close').onclick = closeMigrationModal;
        modal.querySelector('.sl-migration-done').onclick = closeMigrationModal;
        driveDocumentsCache = null;
        var library = document.getElementById('sl-drive-library');
        if (library) renderDriveLibrary('sl-drive-library');
    }

    function renderMigrationPreview(preview) {
        var old = document.getElementById('sl-drive-migration-modal');
        if (old) {
            if (typeof old.__cancelReview === 'function') old.__cancelReview('replaced');
            else old.remove();
        }
        var files = preview.files || [];
        recordMigrationPreview(preview);
        var proposed = files.filter(function (file) { return file.decision === 'proposed'; });
        var rows = files.map(function (file, index) {
            var isProposed = file.decision === 'proposed';
            var isAlready = file.decision === 'already_in_destination';
            var status = isProposed ? 'Proposed move' : isAlready ? 'Already organized' : 'Needs review';
            var className = isProposed ? 'proposed' : isAlready ? 'already' : 'ambiguous';
            return '<div class="sl-migration-row ' + className + '">' + (isProposed ? '<input type="checkbox" data-migration-index="' + index + '" checked aria-label="Approve move for ' + escapeHtml(file.sourceName) + '">' : '<span class="sl-migration-marker">' + (isAlready ? '✓' : '!') + '</span>') + '<div class="sl-migration-file"><strong>' + escapeHtml(file.sourceName) + '</strong><small><span class="sl-migration-status">' + escapeHtml(status) + '</span> · Current: ' + pathLabel(file.sourcePath) + '</small><small>' + escapeHtml(file.reason) + '</small></div><div class="sl-migration-destination"><small>Destination</small><strong>' + (file.destinationPath.length ? pathLabel(file.destinationPath) : 'Manual assignment required') + '</strong></div></div>';
        }).join('');
        var modal = document.createElement('div');
        modal.id = 'sl-drive-migration-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content sl-migration-modal-content"><div class="modal-header"><h3><i class="fa-solid fa-folder-tree"></i> Review Drive folder migration</h3><button class="modal-close" type="button" aria-label="Close">&times;</button></div><div class="modal-body"><div class="sl-migration-dry-run"><strong>Dry run — no files have moved.</strong><span>' + escapeHtml(preview.proposedCount) + ' proposed · ' + escapeHtml(preview.ambiguousCount) + ' need review · ' + escapeHtml(preview.alreadyInDestinationCount) + ' already organized</span></div><p class="sl-migration-note">Only checked proposed rows can move. Ambiguous files stay where they are until an operator resolves them.</p><div class="sl-migration-list">' + (rows || '<div class="sl-drive-library-empty">No non-folder Drive files were found.</div>') + '</div></div><div class="modal-footer"><button class="btn btn-secondary sl-migration-cancel" type="button">Cancel</button><button class="btn btn-primary sl-migration-approve" type="button"' + (proposed.length ? '' : ' disabled') + '>Approve &amp; move ' + proposed.length + ' selected</button></div></div>';
        document.body.appendChild(modal);
        var updateCount = function () {
            var selected = modal.querySelectorAll('input[data-migration-index]:checked').length;
            var approve = modal.querySelector('.sl-migration-approve');
            approve.textContent = 'Approve & move ' + selected + ' selected';
            approve.disabled = selected === 0;
        };
        var cancel = function (kind) {
            recordDriveEventOnce(kind === 'confirm' ? 'DRIVE_FOLDER_MOVE_CONFIRM_CANCELLED' : 'DRIVE_FOLDER_MOVE_CANCELLED', 'Cancelled',
                kind === 'confirm' ? 'Operator declined the migration confirmation dialog.' : 'Operator cancelled the migration review.',
                { previewId: preview.previewId, generatedAt: preview.generatedAt, cancelledFiles: Array.prototype.map.call(modal.querySelectorAll('input[data-migration-index]:checked'), function (input) {
                    return migrationMetadata(files[Number(input.getAttribute('data-migration-index'))], preview, preview.generatedAt);
                }) },
                'migration-cancel|' + preview.previewId + '|' + kind);
            closeMigrationModal();
        };
        modal.__cancelReview = cancel;
        modal.querySelector('.modal-close').onclick = function () { cancel('dialog'); };
        modal.querySelector('.sl-migration-cancel').onclick = function () { cancel('dialog'); };
        modal.querySelectorAll('input[data-migration-index]').forEach(function (input) { input.onchange = updateCount; });
        modal.querySelector('.sl-migration-approve').onclick = function () {
            var selected = Array.prototype.map.call(modal.querySelectorAll('input[data-migration-index]:checked'), function (input) {
                return files[Number(input.getAttribute('data-migration-index'))];
            });
            if (!selected.length) return;
            if (!window.confirm('Approve these ' + selected.length + ' Drive file moves? Ambiguous files will remain unmoved.')) { cancel('confirm'); return; }
            var button = modal.querySelector('.sl-migration-approve');
            button.disabled = true;
            button.textContent = 'Moving approved files…';
            api('/drive/migrations/execute', {
                method: 'POST',
                body: JSON.stringify({
                    approved: true,
                    previewId: preview.previewId,
                    moves: migrationMoves({ files: selected })
                })
            }).then(renderMigrationResult).catch(function (error) {
                button.disabled = false;
                updateCount();
                recordDriveEventOnce('DRIVE_FOLDER_MOVE_APPROVAL_FAILED', 'Failed', error.message, {
                    previewId: preview.previewId, operationId: error.body && error.body.operationId, decidedAt: error.body && error.body.decidedAt,
                    generatedAt: preview.generatedAt, source: 'Drive migration execute', errorCode: errorCode(error)
                }, 'migration-approval-failed|' + preview.previewId + '|' + ((error.body && error.body.operationId) || errorCode(error) || error.message));
                notify(error.message, true);
            });
        };
    }

    function reviewDriveMigration() {
        var policies = migrationPolicies();
        if (!policies.length) {
            notify('No policies with valid effective years are available for folder migration.', true);
            return;
        }
        notify('Preparing a dry-run of existing Drive files. No files will move yet.');
        api('/drive/migrations/preview', {
            method: 'POST',
            body: JSON.stringify({ policies: policies })
        }).then(renderMigrationPreview).catch(function (error) {
            notify(error.message, true);
        });
    }

    function closeDuplicateModal() {
        var modal = document.getElementById('sl-drive-duplicate-modal');
        if (modal) modal.remove();
    }

    function renderDuplicateResult(result) {
        var modal = document.getElementById('sl-drive-duplicate-modal');
        if (!modal) return;
        modal.setAttribute('data-completed', 'true');
        var rows = (result.results || []).map(function (item) {
            recordDriveEventOnce('DRIVE_DUPLICATE_TRASH_DECISION', item.status === 'trashed' || item.status === 'already_trashed' ? 'Completed' : item.status === 'conflict' ? 'Conflict' : 'Failed', item.reason,
                duplicateMetadata(item, result, item.decidedAt || result.decidedAt), 'duplicate-result|' + (result.operationId || result.previewId || '') + '|' + item.fileId + '|' + item.status);
            return '<div class="sl-migration-result-row"><div><strong>' + escapeHtml(item.fileName) + '</strong><small>' + escapeHtml(item.status.replace(/_/g, ' ')) + ' · ' + escapeHtml(item.reason) + '</small></div><div class="sl-migration-path"><span>File ' + escapeHtml(item.fileId) + '</span><b>→</b><span>Retained ' + escapeHtml(item.retainedFileId) + '</span></div></div>';
        }).join('');
        recordDriveEventOnce('DRIVE_DUPLICATE_RESULT', 'Completed', 'Drive duplicate cleanup returned ' + (result.results || []).length + ' decisions.',
            { previewId: result.previewId, operationId: result.operationId, decidedAt: result.decidedAt, resultCount: (result.results || []).length },
            'duplicate-result-summary|' + (result.operationId || result.previewId || ''));
        modal.querySelector('.modal-content').innerHTML = '<div class="modal-header"><h3><i class="fa-solid fa-trash-can-check"></i> Duplicate cleanup results</h3><button class="modal-close" type="button" aria-label="Close">&times;</button></div><div class="modal-body"><div class="sl-migration-summary"><strong>' + escapeHtml(result.trashedCount) + ' trashed</strong><span>' + escapeHtml(result.conflictCount) + ' conflicts</span><span>' + escapeHtml(result.failedCount) + ' failed</span></div><p class="sl-migration-note">The newest copy in each reviewed group was retained. Sharing permissions were not changed.</p><div class="sl-migration-results">' + (rows || '<div class="sl-drive-library-empty">No files were selected.</div>') + '</div></div><div class="modal-footer"><button class="btn btn-primary sl-duplicate-done" type="button">Done</button></div>';
        modal.querySelector('.modal-close').onclick = closeDuplicateModal;
        modal.querySelector('.sl-duplicate-done').onclick = closeDuplicateModal;
        driveDocumentsCache = null;
    }

    function renderDuplicatePreview(preview) {
        var old = document.getElementById('sl-drive-duplicate-modal');
        if (old) {
            if (typeof old.__cancelReview === 'function') old.__cancelReview('replaced');
            else old.remove();
        }
        var files = preview.files || [];
        recordDuplicatePreview(preview);
        var rows = files.map(function (file, index) {
            var candidate = file.decision === 'trash_candidate';
            var uncertain = file.decision === 'metadata_uncertain';
            return '<div class="sl-migration-row ' + (candidate ? 'proposed' : uncertain ? 'ambiguous' : 'already') + '">' + (candidate ? '<input type="checkbox" data-duplicate-index="' + index + '" checked aria-label="Approve trash for ' + escapeHtml(file.fileName) + '">' : '<span class="sl-migration-marker">' + (uncertain ? '!' : '✓') + '</span>') + '<div class="sl-migration-file"><strong>' + escapeHtml(file.fileName) + '</strong><small>' + escapeHtml(candidate ? 'Older duplicate candidate' : uncertain ? 'Metadata needs review' : 'Newest retained copy') + ' · ' + escapeHtml(file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : 'Unknown time') + '</small><small>' + escapeHtml(file.reason) + '</small></div><div class="sl-migration-destination"><small>Drive file ID</small><strong>' + escapeHtml(file.fileId) + '</strong></div></div>';
        }).join('');
        var modal = document.createElement('div');
        modal.id = 'sl-drive-duplicate-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content sl-migration-modal-content"><div class="modal-header"><h3><i class="fa-solid fa-copy"></i> Review System Folder duplicates</h3><button class="modal-close" type="button" aria-label="Close">&times;</button></div><div class="modal-body"><div class="sl-migration-dry-run"><strong>Dry run — nothing has been trashed.</strong><span>' + escapeHtml(preview.candidateCount) + ' older candidates in ' + escapeHtml(preview.groupCount) + ' same-name groups</span></div><p class="sl-migration-note">Only exact same-name files in the same managed System Folder are shown. The newest file in every group is locked for retention.</p><div class="sl-migration-list">' + (rows || '<div class="sl-drive-library-empty">No same-name duplicates were found in the managed System Folder.</div>') + '</div></div><div class="modal-footer"><button class="btn btn-secondary sl-duplicate-cancel" type="button">Cancel</button><button class="btn btn-primary sl-duplicate-approve" type="button"' + (preview.candidateCount ? '' : ' disabled') + '>Approve &amp; trash ' + escapeHtml(preview.candidateCount) + ' selected</button></div></div>';
        document.body.appendChild(modal);
        var updateCount = function () {
            var count = modal.querySelectorAll('input[data-duplicate-index]:checked').length;
            var button = modal.querySelector('.sl-duplicate-approve');
            button.disabled = count === 0;
            button.textContent = 'Approve & trash ' + count + ' selected';
        };
        var cancel = function (kind) {
            recordDriveEventOnce(kind === 'confirm' ? 'DRIVE_DUPLICATE_CONFIRM_CANCELLED' : 'DRIVE_DUPLICATE_CANCELLED', 'Cancelled',
                kind === 'confirm' ? 'Operator declined the duplicate cleanup confirmation dialog.' : 'Operator cancelled the duplicate cleanup review.',
                { previewId: preview.previewId, generatedAt: preview.generatedAt, managedFolderId: preview.folderId || '', managedFolderPath: preview.folderPath || [],
                    cancelledFiles: Array.prototype.map.call(modal.querySelectorAll('input[data-duplicate-index]:checked'), function (input) {
                        return duplicateMetadata(files[Number(input.getAttribute('data-duplicate-index'))], preview, preview.generatedAt);
                    }) },
                'duplicate-cancel|' + preview.previewId + '|' + kind);
            closeDuplicateModal();
        };
        modal.__cancelReview = cancel;
        modal.querySelector('.modal-close').onclick = function () { cancel('dialog'); };
        modal.querySelector('.sl-duplicate-cancel').onclick = function () { cancel('dialog'); };
        modal.querySelectorAll('input[data-duplicate-index]').forEach(function (input) { input.onchange = updateCount; });
        modal.querySelector('.sl-duplicate-approve').onclick = function () {
            var selected = Array.prototype.map.call(modal.querySelectorAll('input[data-duplicate-index]:checked'), function (input) {
                return files[Number(input.getAttribute('data-duplicate-index'))].fileId;
            });
            if (!selected.length) return;
            if (!window.confirm('Move these ' + selected.length + ' reviewed older duplicates to Google Drive trash? The newest copies will be retained.')) { cancel('confirm'); return; }
            var button = modal.querySelector('.sl-duplicate-approve');
            button.disabled = true;
            button.textContent = 'Trashing approved duplicates…';
            api('/drive/duplicates/execute', { method: 'POST', body: JSON.stringify({ approved: true, previewId: preview.previewId, fileIds: selected }) })
                .then(renderDuplicateResult).catch(function (error) {
                    button.disabled = false;
                    updateCount();
                    recordDriveEventOnce('DRIVE_DUPLICATE_APPROVAL_FAILED', 'Failed', error.message, {
                        previewId: preview.previewId, operationId: error.body && error.body.operationId, decidedAt: error.body && error.body.decidedAt,
                        generatedAt: preview.generatedAt, managedFolderId: preview.folderId || '', managedFolderPath: preview.folderPath || [],
                        source: 'Drive duplicate execute', errorCode: errorCode(error)
                    }, 'duplicate-approval-failed|' + preview.previewId + '|' + ((error.body && error.body.operationId) || errorCode(error) || error.message));
                    notify(error.message, true);
                });
        };
    }

    function reviewDriveDuplicates() {
        notify('Preparing a dry-run of same-name files in the managed System Folder.');
        api('/drive/duplicates/preview', { method: 'POST', body: '{}' }).then(renderDuplicatePreview).catch(function (error) { notify(error.message, true); });
    }

    function documentsFromPolicies(policies) {
        var rows = [];
        (policies || []).forEach(function (policy) {
            (policy.docs || []).forEach(function (doc, index) {
                rows.push({
                    id: (policy.id || 'policy') + '-DOC-' + (index + 1),
                    parentType: 'Policy',
                    parentId: policy.id || '',
                    name: doc.name || String(doc),
                    tag: doc.tag || doc.type || 'Policy document',
                    size: doc.size || 'Attached',
                    source: doc.source || 'System'
                });
            });
        });
        return rows;
    }

    function enteredFormData() {
        var fields = {};
        document.querySelectorAll('input[id], input[name], select[id], select[name], textarea[id], textarea[name]').forEach(function (element) {
            if (element.type === 'file' || element.type === 'password' || element.id.indexOf('sl-') === 0) return;
            var key = element.id || element.name;
            if (!key) return;
            if (element.type === 'checkbox' || element.type === 'radio') fields[key] = !!element.checked;
            else fields[key] = element.value;
        });
        return fields;
    }

    function mappedTabs() {
        var T = window.TINUBU || {};
        var C = window.CRMX || {};
        var quote = window.currentQuote || window.__currentQuote || {};
        var licensing = window.LicensingSuite && window.LicensingSuite.snapshot ? window.LicensingSuite.snapshot() : {};
        var promptState = window.AIUploadPrompts && window.AIUploadPrompts.snapshot ? window.AIUploadPrompts.snapshot() : {};
        var promptProfiles = promptState && promptState.profiles ? promptState.profiles : promptState;
        var indexData = window.TINUBU_INDEX_DATA || { sourceFile: '', tabs: [] };
        var indexTabs = (indexData.tabs || []).filter(function (tab) {
            if (!tab || !tab.name || tab.name === 'Brokerages' || tab.name === 'Agents') return false;
            // The parser exposes compatibility aliases for legacy consumers.
            // Persist exactly one sales-rep representation in the workbook.
            if (tab.name === 'Sales reps (2)' && (indexData.tabs || []).some(function (item) { return item.name === 'Sales reps'; })) return false;
            if (tab.name === 'Sales reps') return true;
            return true;
        });
        var workspaceTabs = [
            { name: 'Sync Metadata', rows: [{ key: 'schema', value: 'stop-loss-html-v1' }, { key: 'source', value: 'Tinubu Stop Loss HTML Workbench' }, { key: 'destinationEmail', value: email }, { key: 'syncedAt', value: new Date().toISOString() }] },
            { name: 'Index Import Metadata', rows: [
                { key: 'sourceFile', value: indexData.sourceFile || '' },
                { key: 'sourceId', value: indexData.sourceId || indexData.canonicalMetadata && indexData.canonicalMetadata.sourceId || '' },
                { key: 'sourceKind', value: indexData.sourceKind || 'Authoritative August 2026 reference indexes' },
                { key: 'sourceModifiedAt', value: indexData.sourceModifiedAt || '' },
                { key: 'sourceTabCount', value: indexTabs.length },
                { key: 'availableTabs', value: JSON.stringify(indexData.availableTabs || indexTabs.map(function (tab) { return tab.name; })) },
                { key: 'unavailableLookups', value: JSON.stringify(indexData.unavailableLookups || []) },
                { key: 'availableSourceFiles', value: JSON.stringify(indexData.availableSourceFiles || []) }
            ] },
            { name: 'Policies', rows: T.policies || [] },
            { name: 'Opportunities', rows: C.opps || [] },
            { name: 'Relationships', rows: C.relationships || C.accounts || [] },
            { name: 'Contacts', rows: T.contacts || [] },
            { name: 'Enrollment', rows: T.enrollees || [] },
            { name: 'Claims', rows: T.claims || [] },
            { name: 'Premium Ledger', rows: T.txn || [] },
            { name: 'Documents', rows: documentsFromPolicies(T.policies || []) },
            { name: 'Audit Log', rows: T.audit || [] },
            { name: 'Sanctions', rows: T.ofac || [] },
            { name: 'Brokerages', rows: licensing.brokerages || [] },
            { name: 'Agents', rows: licensing.agents || [] },
            { name: 'Agent Licenses', rows: licensing.stateLicenses || [] },
            { name: 'A&H Licensing Rules', rows: (licensing.licensingRules && licensing.licensingRules.entityRules || []).concat(licensing.licensingRules && licensing.licensingRules.individualRules || []) },
            { name: 'A&H Appointment Rules', rows: licensing.licensingRules && licensing.licensingRules.appointmentRules || [] },
            { name: 'Commission Rules', rows: (licensing.brokerages || []).map(function (brokerage) {
                return {
                    id: brokerage.id,
                    brokerage: brokerage.name,
                    minimumPercent: brokerage.commissionMin,
                    defaultPercent: brokerage.commissionDefault,
                    maximumPercent: brokerage.commissionMax
                };
            }) },
            { name: 'Licensing Audit', rows: licensing.auditLogs || [] },
            { name: 'AI Prompt Profiles', rows: Object.keys(promptProfiles || {}).map(function (profileId) {
                return Object.assign({ id: profileId }, promptProfiles[profileId]);
            }) },
            { name: 'Extracted Data', rows: [{ recordType: 'Current Quote', recordId: quote.id || quote.quoteId || 'Q-2026-99205', data: { quote: quote, fields: enteredFormData() } }] }
        ];
        indexTabs.forEach(function (tab) {
            workspaceTabs.push({ name: tab.name, rows: tab.rows || [] });
        });
        return clean(workspaceTabs);
    }

    function revive(value) {
        if (typeof value !== 'string') return value;
        var trimmed = value.trim();
        if (!trimmed || (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[')) return value;
        try { return JSON.parse(trimmed); } catch (_) { return value; }
    }

    function revivedRows(rows) {
        return (rows || []).map(function (row) {
            var result = {};
            Object.keys(row || {}).forEach(function (key) { result[key] = revive(row[key]); });
            return result;
        });
    }

    function mergeRows(existing, incoming) {
        var output = (existing || []).slice();
        revivedRows(incoming).forEach(function (row) {
            var key = row.id || row.ref || row.quoteId || row.name;
            var index = key == null ? -1 : output.findIndex(function (item) {
                return (item.id || item.ref || item.quoteId || item.name) === key;
            });
            if (index >= 0) output[index] = Object.assign({}, output[index], row);
            else output.push(row);
        });
        return output;
    }

    function cacheTabs(tabs) {
        var snapshot = Array.isArray(tabs) ? tabs : [];
        window.__STOP_LOSS_SHEETS_SNAPSHOT = snapshot;
        var serialized = '';
        var cacheMode = 'Full workbook snapshot';
        try {
            serialized = JSON.stringify(snapshot);
            if (serialized.length > 650000) {
                var rowLimit = 350;
                var compact = [];
                do {
                    compact = snapshot.map(function (tab) {
                        var rows = Array.isArray(tab.rows) ? tab.rows : [];
                        return { name: tab.name, rows: rows.slice(0, rowLimit), totalRows: rows.length, cachedRows: Math.min(rows.length, rowLimit) };
                    });
                    serialized = JSON.stringify(compact);
                    rowLimit = Math.max(0, Math.floor(rowLimit / 2));
                } while (serialized.length > 650000 && rowLimit > 0);
                if (serialized.length > 650000) {
                    compact = snapshot.map(function (tab) {
                        var rows = Array.isArray(tab.rows) ? tab.rows : [];
                        return { name: tab.name, rows: [], totalRows: rows.length, cachedRows: 0 };
                    });
                    serialized = JSON.stringify(compact);
                }
                cacheMode = 'Bounded browser snapshot';
            }
            localStorage.setItem('stop-loss-sheet-workspace', serialized);
            if (cacheMode !== 'Full workbook snapshot' && window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_CACHE_FALLBACK', 'Warning', 'The workbook exceeded the browser cache limit, so a bounded local snapshot was retained. The in-memory and Drive-backed copies remain available.', { bytes: serialized.length, mode: cacheMode });
            }
        } catch (error) {
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_CACHE_FALLBACK', 'Warning', 'The browser cache could not be updated (' + (error && error.name || 'storage error') + '). The current in-memory snapshot remains active and Drive fallback will continue.', { errorName: error && error.name || 'StorageError', mode: cacheMode });
            }
        }
        queueWorkspaceStateSync();
    }

    function hydrateTabs(tabs) {
        var T = window.TINUBU || {};
        var C = window.CRMX || {};
        var byName = {};
        (tabs || []).forEach(function (tab) { byName[tab.name] = revivedRows(tab.rows); });
        var operationalNames = ['Sync Metadata', 'Index Import Metadata', 'Policies', 'Opportunities', 'Relationships', 'Contacts', 'Enrollment', 'Claims', 'Premium Ledger', 'Documents', 'Audit Log', 'Sanctions', 'Brokerages', 'Agents', 'Agent Licenses', 'A&H Licensing Rules', 'A&H Appointment Rules', 'Commission Rules', 'Licensing Audit', 'AI Prompt Profiles', 'Extracted Data'];
        var referenceTabs = (tabs || []).filter(function (tab) {
            if (operationalNames.indexOf(tab.name) >= 0) return false;
            if (tab.name === 'Sales reps (2)' && byName['Sales reps']) return false;
            return true;
        }).map(function (tab) {
            return { name: tab.name, sourceId: tab.sourceId || '', rows: revivedRows(tab.rows) };
        });
        if (referenceTabs.length) {
            var metadata = byName['Index Import Metadata'] || [];
            var sourceFileRow = metadata.filter(function (row) { return row.key === 'sourceFile'; })[0];
            var sourceIdRow = metadata.filter(function (row) { return row.key === 'sourceId'; })[0];
            var sourceKindRow = metadata.filter(function (row) { return row.key === 'sourceKind'; })[0];
            var modifiedRow = metadata.filter(function (row) { return row.key === 'sourceModifiedAt'; })[0];
            var unavailableRow = metadata.filter(function (row) { return row.key === 'unavailableLookups'; })[0];
            var availableFilesRow = metadata.filter(function (row) { return row.key === 'availableSourceFiles'; })[0];
            var active = window.TinubuIndex && typeof window.TinubuIndex.activeSource === 'function'
                ? window.TinubuIndex.activeSource() : null;
            var incomingSourceId = sourceIdRow && sourceIdRow.value || '';
            var pending = window.TinubuSystemLog && typeof window.TinubuSystemLog.pendingReview === 'function'
                ? window.TinubuSystemLog.pendingReview().indexReview : null;
            // A remote snapshot may be older than locally staged review work.
            // Keep the active lookup untouched until that review is resolved.
            if (!pending || !active || (incomingSourceId && incomingSourceId === active.sourceId)) {
                var hydrated = {
                    sourceFile: sourceFileRow && sourceFileRow.value || '',
                    sourceId: incomingSourceId,
                    sourceKind: sourceKindRow && sourceKindRow.value || 'Cloud workbook snapshot',
                    sourceModifiedAt: modifiedRow && modifiedRow.value || '',
                    availableSourceFiles: revive(availableFilesRow && availableFilesRow.value) || [],
                    unavailableLookups: revive(unavailableRow && unavailableRow.value) || [],
                    tabs: referenceTabs
                };
                if (window.TinubuIndex && typeof window.TinubuIndex.refresh === 'function') window.TinubuIndex.refresh(hydrated);
                else {
                    window.TINUBU_INDEX_DATA = hydrated;
                    window.dispatchEvent(new CustomEvent('tinubu:indexes-hydrated', { detail: hydrated }));
                }
            }
        }
        if (byName.Policies) T.policies = mergeRows(T.policies, byName.Policies);
        if (byName.Opportunities) {
            var restoredOpportunities = mergeRows(C.opps, byName.Opportunities);
            if (typeof C.hydrateOpportunities === 'function') C.hydrateOpportunities(restoredOpportunities);
            else C.opps = restoredOpportunities;
        }
        if (byName.Relationships) {
            var restoredRelationships = mergeRows(C.relationships || C.accounts, byName.Relationships);
            if (typeof C.hydrateRelationships === 'function') C.hydrateRelationships(restoredRelationships);
            else C.relationships = restoredRelationships;
        }
        if (byName.Contacts) T.contacts = mergeRows(T.contacts, byName.Contacts);
        if (byName.Enrollment) T.enrollees = mergeRows(T.enrollees, byName.Enrollment);
        if (byName.Claims) T.claims = mergeRows(T.claims, byName.Claims);
        if (byName['Premium Ledger']) T.txn = mergeRows(T.txn, byName['Premium Ledger']);
        if (byName['Audit Log']) T.audit = mergeRows(T.audit, byName['Audit Log']);
        if (byName.Sanctions) T.ofac = mergeRows(T.ofac, byName.Sanctions);
        if (window.LicensingSuite && byName.Brokerages) {
            var licensingState = window.LicensingSuite.snapshot();
            licensingState.brokerages = mergeRows(licensingState.brokerages, byName.Brokerages);
            licensingState.agents = mergeRows(licensingState.agents, byName.Agents || []);
            licensingState.stateLicenses = mergeRows(licensingState.stateLicenses, byName['Agent Licenses'] || []);
            if (byName['A&H Licensing Rules'] || byName['A&H Appointment Rules']) {
                licensingState.licensingRules = Object.assign({}, licensingState.licensingRules || {}, {
                    entityRules: (byName['A&H Licensing Rules'] || []).filter(function (row) { return row.requiredParty === 'entity'; }),
                    individualRules: (byName['A&H Licensing Rules'] || []).filter(function (row) { return row.requiredParty === 'individual'; }),
                    appointmentRules: byName['A&H Appointment Rules'] || []
                });
            }
            licensingState.auditLogs = mergeRows(licensingState.auditLogs, byName['Licensing Audit'] || []);
            window.LicensingSuite.hydrate(licensingState);
        }
        if (window.AIUploadPrompts && byName['AI Prompt Profiles']) {
            var profiles = {};
            byName['AI Prompt Profiles'].forEach(function (row) {
                var key = row.id || (row.uploadArea + '::' + row.documentType);
                if (key) profiles[key] = row;
            });
            window.AIUploadPrompts.hydrate({ schemaVersion: 2, profiles: profiles });
        }
        var extracted = byName['Extracted Data'] && byName['Extracted Data'][0];
        var savedData = extracted && extracted.data;
        if (savedData && savedData.quote) window.__currentQuote = savedData.quote;
        if (savedData && savedData.fields) {
            Object.keys(savedData.fields).forEach(function (key) {
                var element = document.getElementById(key) || document.querySelector('[name="' + CSS.escape(key) + '"]');
                if (!element || element.type === 'file') return;
                if (element.type === 'checkbox' || element.type === 'radio') element.checked = !!savedData.fields[key];
                else element.value = savedData.fields[key] == null ? '' : savedData.fields[key];
            });
        }
        window.__STOP_LOSS_SHEETS_SNAPSHOT = tabs || [];
        cacheTabs(tabs);
        if (window.LicensingSuite && typeof window.LicensingSuite.syncCRM === 'function') window.LicensingSuite.syncCRM();
        if (typeof window.refreshStopLossViews === 'function') window.refreshStopLossViews();
        if (C.render && document.getElementById('view-sales-crm') && document.getElementById('view-sales-crm').classList.contains('active')) C.render();
        return tabs || [];
    }

    function restoreCachedTabs() {
        try {
            var cached = JSON.parse(localStorage.getItem('stop-loss-sheet-workspace') || '[]');
            if (Array.isArray(cached) && cached.length) hydrateTabs(cached);
        } catch (_) {
            try { localStorage.removeItem('stop-loss-sheet-workspace'); } catch (__) {}
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                window.TinubuSystemLog.recordCloudEvent('CLOUD_CACHE_FALLBACK', 'Warning', 'The browser workbook cache could not be restored. The application will continue with Drive or embedded fallback data.', { mode: 'Restore failed' });
            }
        }
    }
    window.addEventListener('stop-loss-licensing-ready', restoreCachedTabs);
    window.addEventListener('stop-loss-ai-prompts-ready', function () {
        if (workspaceStateRemote && workspaceStateRemote.state) hydrateWorkspaceState(workspaceStateRemote.state);
        restoreCachedTabs();
    });

    function pullAndHydrate(options) {
        options = options || {};
        if (!cloudAuthorizationReady || cloudAuthBlocked) return Promise.resolve(null);
        return api('/sheets/snapshot').then(function (snapshot) {
            hydrateTabs(snapshot.tabs);
            sheetsRevision = snapshot.revision || '';
            if (!options.silent) notify(snapshot.tabs.length + ' workbook tabs retrieved, restored, and cached in the HTML application.');
            return snapshot;
        }).catch(function (error) {
            if (!options.silent) notify(error.message, true);
            var code = errorCode(error);
            if (code === 'GOOGLE_REAUTH_REQUIRED') {
                cloudAuthBlocked = true;
                updateCloudState('sheets', 'Reauthorization required', error.message, { code: code, writable: false }, 'Failed');
            }
            return null;
        });
    }

    function syncCurrentData(options) {
        options = options || {};
        var tabs = mappedTabs();
        cacheTabs(tabs);
        if (!sheetsOperationId) sheetsOperationId = newOperationId('sheets-sync');
        function retainSheetsOperation(error) {
            if (!queueableCloudFailure(error)) return;
            queuePendingSync({
                operationId: sheetsOperationId,
                targetKey: 'sheets-workbook',
                kind: 'sheets_sync',
                service: 'sheets',
                target: { spreadsheetId: currentStatus && (currentStatus.spreadsheetId || currentStatus.spreadsheetUrl) || null },
                expectedRevision: sheetsRevision || null,
                payload: { tabs: tabs, expectedRevision: sheetsRevision || null },
                status: error && (error.isConflict || error.status === 409) ? 'review' : 'pending',
                reason: error && (error.isConflict || error.status === 409)
                    ? 'The Google Sheets workbook changed elsewhere and must be reviewed before retrying.'
                    : 'The Sheets update was retained after protected access failed.'
            });
        }
        if (!sheetsRevision) {
            var revisionError = new Error('Pull the latest workbook before pushing. The cloud write was not applied and the browser workspace remains available.');
            updateCloudState('sheets', 'Revision required', revisionError.message, { writable: false }, 'Warning');
            retainSheetsOperation(revisionError);
            if (!options.backupOnFailure) {
                notify(revisionError.message, true);
                return Promise.reject(revisionError);
            }
            return uploadWorkspaceBackup(tabs, options.forceBackup).then(function (backup) {
                revisionError.driveBacked = !!backup;
                throw revisionError;
            });
        }
        return api('/sheets/sync', {
            method: 'POST',
            body: JSON.stringify({ tabs: tabs, expectedRevision: sheetsRevision })
        }).then(function (result) {
            sheetsRevision = result.revision || sheetsRevision;
            sheetsOperationId = '';
            if (!options.silent) notify(result.updatedRows + ' records saved across ' + result.updatedTabs + ' Google Sheets tabs.');
            refreshStatus();
            return result;
        }).catch(function (error) {
            retainSheetsOperation(error);
            updateCloudState('sheets', 'Read-only · Drive backup', 'Google Sheets was not updated. Drive backup and the browser snapshot remain available.', { writable: false }, 'Warning');
            if (!options.backupOnFailure) {
                notify(error.message + ' The data remains cached in this browser, but Google Sheets was not updated.', true);
                throw error;
            }
            return uploadWorkspaceBackup(tabs, options.forceBackup).then(function (backup) {
                error.driveBacked = !!backup;
                throw error;
            });
        });
    }

    function syncFromSystemLog(options) {
        options = Object.assign({}, options || {}, { backupOnFailure: true });
        return syncCurrentData(options).catch(function (error) {
            var message = error && error.message ? error.message : 'The cloud push could not be completed.';
            if (error && error.driveBacked) message += ' A normalized workspace backup was saved to Google Drive.';
            notify(message, true, {
                action: 'CLOUD_OPERATION',
                metadata: { driveBacked: !!(error && error.driveBacked), source: 'System Log push' }
            });
            return { blocked: true, error: message, driveBacked: !!(error && error.driveBacked) };
        });
    }

    function persistImport(file) {
        var drive = file ? uploadFile(file).then(function (result) {
            return { value: result };
        }).catch(function (error) {
            return { error: error };
        }) : Promise.resolve({ value: null });
        var sheets = syncCurrentData({ backupOnFailure: true, forceBackup: true }).then(function (result) {
            return { value: result };
        }).catch(function (error) {
            return { error: error };
        });
        return Promise.all([drive, sheets]).then(function (results) {
            var driveResult = results[0], sheetsResult = results[1], hasError = !!(driveResult.error || sheetsResult.error);
            if (!hasError) notify('Import saved to Google Sheets' + (file ? ' and the source file was saved to Google Drive.' : '.'));
            else notify('Census rows were imported locally. Cloud sync is temporarily unavailable; the browser cache remains active and will retry later.', true);
            return {
                drive: driveResult.value || null,
                sheets: sheetsResult.value || null,
                driveError: driveResult.error || null,
                sheetsError: sheetsResult.error || null
            };
        });
    }

    function refreshStatus() {
        cloudAuthBlocked = false;
        cloudAuthorizationReady = false;
        refreshPortableSessionState();
        var token = '';
        try { token = sessionStorage.getItem('tinubu-portable-session-v1') || ''; } catch (_) {}
        var applicationAccessRequest = api('/auth/access-status').then(function (result) {
            var access = result && result.application || {};
            var session = access.session || {};
            var provider = access.identityProvider || {};
            var authorization = access.authorization || {};
            var repository = access.repository || {};
            var sessionStatus = session.status === 'connected' ? 'Connected'
                : session.status === 'expired' ? 'Expired'
                    : session.status === 'invalid' ? 'Invalid'
                        : 'Sign-in required';
            var providerStatus = provider.status === 'github' ? 'GitHub verified'
                : provider.status === 'other' ? 'Other Clerk provider'
                    : provider.status === 'unavailable' ? 'Provider unavailable'
                        : 'Not verified';
            var authorizationStatus = authorization.status === 'authorized' ? 'Authorized'
                : authorization.status === 'denied' ? 'Denied'
                    : authorization.status === 'unavailable' ? 'Authorization unavailable'
                        : authorization.status === 'not_configured' ? 'Administrator setup required'
                            : 'Sign-in required';
            var repositoryStatus = repository.status === 'connected' ? 'Connected'
                : repository.status === 'unavailable' ? 'Unavailable'
                    : 'Not connected';
            updateCloudState('session', sessionStatus, session.message || 'Application session status is available.', {
                mode: session.mode || (window.STOP_LOSS_IS_FILE ? 'portable' : 'hosted'),
                code: session.status === 'expired' ? 'PORTABLE_SESSION_EXPIRED' : session.status === 'invalid' ? 'PORTABLE_SESSION_INVALID' : session.status === 'required' ? 'SESSION_REQUIRED' : null
            }, sessionStatus === 'Connected' ? 'Completed' : sessionStatus === 'Sign-in required' ? 'Warning' : 'Failed');
            updateCloudState('github', providerStatus, provider.message || 'Clerk provider status is available.', {
                provider: provider.status || 'unknown'
            }, provider.status === 'github' ? 'Completed' : provider.status === 'unavailable' ? 'Failed' : 'Warning');
            updateCloudState('applicationAuthorization', authorizationStatus, authorization.message || 'Application authorization status is available.', {
                code: authorization.code || null
            }, authorization.status === 'authorized' ? 'Completed' : authorization.status === 'required' ? 'Warning' : 'Failed');
            updateCloudState('repository', repositoryStatus, repository.message || 'GitHub repository configuration status is available.', {
                repository: repository.repository || 'ahpoladminsys-sudo/AH-PAS'
            }, repository.status === 'connected' ? 'Completed' : repository.status === 'unavailable' ? 'Failed' : 'Warning');
            if (window.TinubuSystemLog && typeof window.TinubuSystemLog.recordCloudEvent === 'function') {
                var outcome = authorization.status === 'authorized' ? 'Completed' : authorization.status === 'denied' ? 'Unauthorized' : session.status === 'connected' ? 'Warning' : 'Pending';
                window.TinubuSystemLog.recordCloudEvent('APPLICATION_ACCESS_CHECKED', outcome, authorization.message || session.message || 'Application access status was checked.', {
                    mode: session.mode || (window.STOP_LOSS_IS_FILE ? 'portable' : 'hosted'),
                    provider: provider.status || 'unknown',
                    authorization: authorization.status || 'unknown',
                    code: authorization.code || null,
                    dedupeKey: 'application-access|' + String(session.status || 'unknown') + '|' + String(provider.status || 'unknown') + '|' + String(authorization.status || 'unknown'),
                    dedupeWindowMs: 300000
                });
                window.TinubuSystemLog.recordCloudEvent('GITHUB_REPOSITORY_STATUS', repository.status === 'connected' ? 'Completed' : 'Pending', repository.message || 'GitHub repository status was checked.', {
                    repository: repository.repository || 'ahpoladminsys-sudo/AH-PAS',
                    state: repository.status || 'not_connected',
                    dedupeKey: 'github-repository|' + String(repository.status || 'not_connected'),
                    dedupeWindowMs: 300000
                });
            }
            return result;
        }).catch(function (error) {
            updateCloudState('github', 'Provider unavailable', failureDetail(error, 'The Clerk sign-in provider could not be checked.'), { code: errorCode(error) || null }, 'Failed');
            updateCloudState('applicationAuthorization', 'Authorization unavailable', failureDetail(error, 'Application access could not be checked.'), { code: errorCode(error) || null }, 'Failed');
            updateCloudState('repository', 'Unavailable', 'Repository configuration could not be checked because application access status is unavailable.', { repository: 'ahpoladminsys-sudo/AH-PAS' }, 'Failed');
            return null;
        });
        var authorizationRequest = api('/auth/status').then(function (status) {
            var state = status.status === 'configured' && status.valid ? 'Configured' : status.status === 'invalid' ? 'Allowlist invalid' : 'Allowlist not configured';
            updateCloudState('authorization', state, status.message || 'Workspace authorization status is available.', {
                configured: !!status.configured,
                valid: !!status.valid,
                status: status.status,
                source: status.source
            }, status.status === 'configured' ? 'Completed' : 'Failed');
            if (state !== 'Configured') {
                cloudAuthBlocked = true;
                var detail = authorizationBlockedDetail(status.status === 'invalid' ? 'ALLOWLIST_INVALID' : 'ALLOWLIST_NOT_CONFIGURED');
                updateCloudState('sheets', state, detail, { code: status.status === 'invalid' ? 'ALLOWLIST_INVALID' : 'ALLOWLIST_NOT_CONFIGURED' }, 'Failed');
                updateCloudState('drive', state, detail, { code: status.status === 'invalid' ? 'ALLOWLIST_INVALID' : 'ALLOWLIST_NOT_CONFIGURED' }, 'Failed');
            }
            return status;
        }).catch(function (error) {
            cloudAuthorizationReady = true;
            cloudAuthBlocked = true;
            updateCloudState('authorization', 'Unavailable', 'Workspace authorization status could not be checked.', {}, 'Failed');
            return null;
        });
        var protectedStatusRequest = authorizationRequest.then(function (authorization) {
            if (!authorization) {
                cloudAuthorizationReady = true;
                cloudAuthBlocked = true;
                updateCloudState('sheets', 'Authorization unavailable', 'Workspace authorization status could not be checked.', { code: 'AUTHORIZATION_PROVIDER_UNAVAILABLE' }, 'Failed');
                updateCloudState('drive', 'Authorization unavailable', 'Workspace authorization status could not be checked.', { code: 'AUTHORIZATION_PROVIDER_UNAVAILABLE' }, 'Failed');
                return Promise.allSettled ? Promise.allSettled([]) : Promise.resolve([]);
            }
            if (authorization && authorization.status !== 'configured') {
                cloudAuthorizationReady = true;
                return Promise.allSettled ? Promise.allSettled([]) : Promise.resolve([]);
            }
            cloudAuthorizationReady = true;
            if (window.STOP_LOSS_IS_FILE && !token) {
                cloudAuthBlocked = true;
                var detail = 'Connect a short-lived cloud session before checking protected services.';
                updateCloudState('sheets', 'Session required', detail, { code: 'SESSION_REQUIRED' }, 'Warning');
                updateCloudState('drive', 'Session required', detail, { code: 'SESSION_REQUIRED' }, 'Warning');
                return Promise.allSettled ? Promise.allSettled([]) : Promise.resolve([]);
            }
            var sheetsRequest = api('/sheets/status').then(function (status) {
            currentStatus = status;
            var requiresGoogleReauth = status.errorCode === 'GOOGLE_REAUTH_REQUIRED';
            var sheetUnavailable = status.accessState === 'provider_error' || /unavailable|failed|denied|not found|access/i.test(status.message || '');
            var sheetStatus = requiresGoogleReauth ? 'Reauthorization required' : sheetUnavailable ? 'Provider unavailable' : (!status.configured ? 'Setup needed' : status.writable ? 'Connected · writable verified' : 'Connected · read-only');
            updateCloudState('sheets', sheetStatus, status.message || (status.writable ? 'Workbook is connected and a successful write marker exists.' : 'Workbook reads are available; write capability has not been verified.'), {
                configured: !!status.configured,
                writable: !!status.writable,
                accessState: status.accessState || null,
                code: status.errorCode || null,
                spreadsheetId: status.spreadsheetId || null,
                spreadsheetUrl: status.spreadsheetUrl || null
            }, sheetUnavailable ? 'Failed' : status.configured ? 'Completed' : 'Warning');
            if (requiresGoogleReauth) cloudAuthBlocked = true;
            if (status.spreadsheetUrl || status.spreadsheetId) {
                savedSheetUrl = status.spreadsheetUrl || status.spreadsheetId;
                try { localStorage.setItem('stop-loss-sheet-url', savedSheetUrl); } catch (_) {}
            }
            return status;
        }).catch(function (error) {
            updateCloudState('sheets', failureStatus(error), isAuthorizationFailure(error) ? authorizationBlockedDetail(errorCode(error)) : failureDetail(error, 'Google Sheets status could not be checked.'), { code: errorCode(error) || null }, 'Failed');
            return null;
        });
            var driveRequest = api('/drive/status').then(function (status) {
            var driveStatus = status.configured ? 'Connected' : 'Unavailable';
            updateCloudState('drive', driveStatus, status.message || (status.configured ? 'Google Drive document storage is available.' : 'Google Drive is not configured for this workspace.'), { configured: !!status.configured, accessState: status.accessState || null }, status.configured ? 'Completed' : 'Warning');
            return status;
        }).catch(function (error) {
            updateCloudState('drive', failureStatus(error), isAuthorizationFailure(error) ? authorizationBlockedDetail(errorCode(error)) : failureDetail(error, 'Google Drive status could not be checked.'), { code: errorCode(error) || null }, 'Failed');
            return null;
        });
            var providerChecks = Promise.allSettled ? Promise.allSettled([sheetsRequest, driveRequest]) : Promise.all([sheetsRequest.catch(function () {}), driveRequest.catch(function () {})]);
            return providerChecks.then(function (result) {
                var hasTransientFailure = /provider unavailable|failed/i.test(String((cloudSyncState.sheets || {}).status || '') + ' ' + String((cloudSyncState.drive || {}).status || ''));
                if (hasTransientFailure) scheduleStatusRetry();
                else statusRetryAttempt = 0;
                if (!cloudAuthBlocked) reconcilePendingSync();
                return result;
            });
        });
        return Promise.allSettled
            ? Promise.allSettled([applicationAccessRequest, protectedStatusRequest])
            : Promise.all([applicationAccessRequest.catch(function () {}), protectedStatusRequest.catch(function () {})]);
    }

    function scheduleStatusRetry() {
        if (statusRetryTimer || statusRetryAttempt >= 3 || cloudAuthBlocked) return;
        var delay = Math.min(300000, 1500 * Math.pow(2, statusRetryAttempt));
        statusRetryAttempt += 1;
        statusRetryTimer = setTimeout(function () {
            statusRetryTimer = null;
            refreshStatus();
        }, delay);
    }

    function toBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = reject;
            reader.onload = function () { resolve(String(reader.result || '').split(',').pop()); };
            reader.readAsDataURL(file);
        });
    }

    function textBase64(content) {
        var bytes = new TextEncoder().encode(String(content == null ? '' : content));
        var binary = '';
        bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    var lastWorkspaceBackupAt = 0;
    function uploadWorkspaceBackup(tabs, force) {
        var now = Date.now();
        if (!force && now - lastWorkspaceBackupAt < 300000) return Promise.resolve(null);
        lastWorkspaceBackupAt = now;
        return api('/drive/documents', {
            method: 'POST',
            body: JSON.stringify({
                name: 'stop-loss-workspace-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json',
                mimeType: 'application/json',
                systemOwned: true,
                contentBase64: textBase64(JSON.stringify({ schema: 'stop-loss-html-v1', tabs: tabs }, null, 2))
            })
        }).then(function (doc) {
            notify('Google Sheets is read-only. A normalized workspace backup was saved to Google Drive.', true);
            return doc;
        });
    }

    function safeFolderName(value) {
        return String(value == null ? '' : value).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180);
    }

    function documentCategory(name, requested) {
        if (requested) return requested;
        var lower = String(name || '').toLowerCase();
        if (/invoice|billing|premium|statement|ledger/.test(lower)) return 'Billing';
        if (/enroll|census|eligib|member roster/.test(lower)) return 'Enrollment';
        if (/quote|rfp|proposal|sbc|loss run|claims report|plan design/.test(lower)) return 'Quote Docs';
        if (/policy|endorsement|certificate|schedule of benefits|declaration/.test(lower)) return 'UW Docs';
        return '';
    }

    function policyFolderPath(fileName, options) {
        options = options || {};
        if (options.skipPolicyRouting) return [];
        if (Array.isArray(options.folderPath)) return options.folderPath.map(safeFolderName).filter(Boolean);
        var T = window.TINUBU || {}, policy = options.policy || (T.policy && T.policy(T.currentPolicy));
        if (!policy || !policy.id || !policy.name) return [];
        var effective = String(policy.effectiveDate || policy.effective || '');
        var yearMatch = effective.match(/\b(20\d{2})\b/);
        var year = safeFolderName(options.effectiveYear || (yearMatch && yearMatch[1]) || new Date().getFullYear());
        var root = safeFolderName(policy.id + ' - ' + policy.name);
        var category = safeFolderName(documentCategory(fileName, options.category));
        return [root, year].concat(category ? [category] : []);
    }

    function uploadFile(file, options) {
        if (!file) return Promise.resolve();
        options = options || {};
        var operation = options.operationId || newOperationId('drive-upload');
        var requestPayload = null;
        return toBase64(file).then(function (contentBase64) {
            var folderPath = policyFolderPath(file.name, options);
            requestPayload = {
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                contentBase64: contentBase64,
                folderPath: folderPath.length ? folderPath : undefined,
                operationId: operation
            };
            return api('/drive/documents', {
                method: 'POST',
                body: JSON.stringify(requestPayload)
            });
        }).then(function (doc) {
            driveDocumentsCache = null;
            notify(doc.name + ' saved to Google Drive.');
            return doc;
        }).catch(function (error) {
            if (requestPayload && queueableCloudFailure(error)) {
                queuePendingSync({
                    operationId: operation,
                    targetKey: 'drive-upload:' + operation,
                    kind: 'drive_upload',
                    service: 'drive',
                    target: { fileId: null, folderPath: requestPayload.folderPath || [] },
                    payload: requestPayload,
                    status: error.isConflict ? 'review' : 'pending',
                    reason: error.isConflict ? 'The Drive upload needs operator review before retrying.' : 'The Drive upload was retained after protected access failed.'
                });
            }
            notify(error.message, true);
            throw error;
        });
    }

    window.saveGeneratedDocumentToDrive = function (name, mimeType, content, options) {
        options = options || {};
        var folderPath = policyFolderPath(name, options);
        var serialized = String(content == null ? '' : content);
        var dataUri = serialized.match(/^data:[^;,]+(?:;[^,]+)*;base64,(.*)$/);
        return api('/drive/documents', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                mimeType: mimeType || 'text/plain',
                contentBase64: dataUri ? dataUri[1] : textBase64(serialized),
                folderPath: folderPath.length ? folderPath : undefined,
                systemOwned: options.systemOwned === true ? true : undefined
            })
        }).then(function (doc) {
            notify(doc.name + ' generated and saved to Google Drive.');
            return doc;
        }).catch(function (error) {
            notify(error.message, true);
            throw error;
        });
    };

    function configureWorkbook(value) {
        var spreadsheetUrl = String(value || '').trim();
        if (!spreadsheetUrl) return Promise.reject(new Error('Enter a valid Google Sheets URL or spreadsheet ID.'));
        return api('/sheets/configure', {
            method: 'POST',
            body: JSON.stringify({ spreadsheetUrl: spreadsheetUrl, title: 'Tinubu Stop Loss Workspace' })
        }).then(function () {
            savedSheetUrl = spreadsheetUrl;
            try { localStorage.setItem('stop-loss-sheet-url', savedSheetUrl); } catch (_) {}
            notify('Workbook link updated for ' + email + '.');
            refreshStatus();
        }).catch(function (error) { notify(error.message, true); });
    }

    function saveApiOrigin(value) {
        try {
            window.stopLossSetApiOrigin(String(value || '').trim());
            notify('Hosted API origin saved. Connect a cloud session to access protected services.');
            refreshStatus();
        } catch (error) { notify(error.message, true); }
    }

    function recoverCloudAccess() {
        var authState = cloudSyncState.authorization || {};
        var sessionState = cloudSyncState.session || {};
        if (window.STOP_LOSS_IS_FILE && sessionState.status !== 'Connected') {
            connectPortableSession();
            return;
        }
        if (!window.STOP_LOSS_IS_FILE && /session required|unauthorized|sign-in/i.test(String(sessionState.status || '') + ' ' + String(cloudSyncState.sheets && cloudSyncState.sheets.status || '') + ' ' + String(cloudSyncState.drive && cloudSyncState.drive.status || ''))) {
            connectHostedSession();
            return;
        }
        if (authState.status === 'Allowlist not configured' || authState.status === 'Allowlist invalid') {
            notify('Ask an administrator to update the server authorized-user setting, then use Re-check authorization.', true);
        }
        refreshStatus();
    }
    function transferSheetOwnership() {
        if (!currentStatus || !currentStatus.spreadsheetId) return notify('Save a workbook link first.', true);
        return api('/drive/transfer-sheet', {
            method: 'POST',
            body: JSON.stringify({
                spreadsheetId: currentStatus.spreadsheetId,
                destinationEmail: email,
                role: 'owner'
            })
        }).then(function (result) {
            notify(result.message);
        }).catch(function (error) { notify(error.message, true); });
    }

    function connectionSnapshot() {
        return {
            email: email,
            isFile: !!window.STOP_LOSS_IS_FILE,
            apiOrigin: window.STOP_LOSS_API_ORIGIN || '',
            workbook: savedSheetUrl || (currentStatus && (currentStatus.spreadsheetUrl || currentStatus.spreadsheetId)) || '',
            links: {
                workbook: currentStatus && currentStatus.spreadsheetUrl || workspaceLinks.activeWorkbookUrl || savedSheetUrl || '',
                source: workspaceLinks.sourceExtractUrl || ''
            },
            pendingSync: pendingSyncState(),
            states: clean(cloudSyncState)
        };
    }

    window.StopLossCloud = {
        mappedTabs: mappedTabs,
        hydrateTabs: hydrateTabs,
        pull: pullAndHydrate,
        sync: syncCurrentData,
        syncFromSystemLog: syncFromSystemLog,
        uploadFile: uploadFile,
        listDriveDocuments: listDriveDocuments,
        listDriveIndexWorkbooks: listDriveIndexWorkbooks,
        readDriveDocument: readDriveDocument,
        updateDriveDocumentContent: updateDriveDocumentContent,
        saveEnrollmentWorkbook: saveEnrollmentWorkbook,
        renderDriveLibrary: renderDriveLibrary,
        reviewDriveMigration: reviewDriveMigration,
        reviewDriveDuplicates: reviewDriveDuplicates,
        persistImport: persistImport,
        pendingSyncSnapshot: pendingSyncSnapshot,
        pendingSyncState: pendingSyncState,
        reconcilePendingSync: reconcilePendingSync,
        loadWorkspaceState: loadWorkspaceState,
        persistWorkspaceState: persistWorkspaceState,
        queueWorkspaceStateSync: queueWorkspaceStateSync,
        refreshStatus: refreshStatus,
        connectPortableSession: connectPortableSession,
        connectHostedSession: connectHostedSession,
        reconnectGoogleAccess: reconnectGoogleAccess,
        recoverCloudAccess: recoverCloudAccess,
        configureWorkbook: configureWorkbook,
        saveApiOrigin: saveApiOrigin,
        transferSheetOwnership: transferSheetOwnership,
        connectionSnapshot: connectionSnapshot,
        workspaceStateSnapshot: function () {
            return { meta: clean(workspaceStateMeta), remote: clean(workspaceStateRemote) };
        }
    };

    document.addEventListener('change', function (event) {
        var input = event.target;
        if (!input || input.id === 'v2-rfp-intake-file' || input.id === 'policyDocInput' || input.id === 'sl2-policy-doc-file' || input.id === 'opportunity-document-picker' || input.id === 'opportunity-detail-document-picker' || input.id === 'system-cloud-file' || input.name === 'attachment' || input.type !== 'file' || !input.files) return;
        if (input.closest && input.closest('#bulkCensusForm')) return;
        Array.prototype.forEach.call(input.files, function (file) { uploadFile(file); });
    }, true);
    window.viewDriveDocument = openDriveDocument;
    window.downloadDriveDocument = downloadDriveDocument;
    function queueDirectoryRefresh() {
        if (window.TinubuIndex && typeof window.TinubuIndex.queueDirectorySync === 'function') {
            window.TinubuIndex.queueDirectorySync();
        }
    }
    if (window.TINUBU && typeof window.TINUBU.log === 'function') {
        var originalLog = window.TINUBU.log;
        window.TINUBU.log = function () {
            var result = originalLog.apply(window.TINUBU, arguments);
            queueDirectoryRefresh();
            return result;
        };
    }
    document.addEventListener('change', function (event) {
        var input = event.target;
        if (!input || input.type === 'file' || input.id === 'sl-sheet-url') return;
        queueDirectoryRefresh();
    }, true);
    window.addEventListener('tinubu:workspace-state-changed', queueWorkspaceStateSync);
    window.addEventListener('online', function () {
        statusRetryAttempt = 0;
        if (statusRetryTimer) {
            clearTimeout(statusRetryTimer);
            statusRetryTimer = null;
        }
        refreshStatus();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshStatus();
    });
    window.addEventListener('stop-loss-licensing-ready', function () {
        if (workspaceStateRemote && workspaceStateRemote.state && !window.__tinubuLicensingAuthoritative) {
            hydrateWorkspaceState(workspaceStateRemote.state);
        }
        queueWorkspaceStateSync();
    });
    window.addEventListener('stop-loss-licensing-state-ready', function () {
        if (workspaceStateRemote && workspaceStateRemote.state && !window.__tinubuLicensingAuthoritative) {
            hydrateWorkspaceState(workspaceStateRemote.state);
        }
        queueWorkspaceStateSync();
    });
    window.addEventListener('tinubu:index-runtime-ready', function () {
        if (workspaceStateRemote && workspaceStateRemote.state) hydrateWorkspaceState(workspaceStateRemote.state);
    });
    restoreCachedTabs();
    refreshPortableSessionState();
    if (window.STOP_LOSS_IS_FILE && !window.STOP_LOSS_API_ORIGIN) {
        cloudAuthorizationReady = true;
        updateCloudState('sheets', 'API origin needed', 'Set the hosted API origin before checking Google Sheets.', { configured: false }, 'Warning');
        updateCloudState('drive', 'API origin needed', 'Set the hosted API origin before checking Google Drive.', { configured: false }, 'Warning');
        setWorkspaceStateStatus('Offline / local only', 'Set the hosted API origin to enable cloud recovery.');
    } else {
        refreshStatus().then(function () {
            if (cloudAuthBlocked) return;
            loadWorkspaceState();
            pullAndHydrate({ silent: true }).catch(function () {
                // Cached state remains active when the remote workbook is unavailable.
            });
        });
    }
    if (workspaceStateMeta.status) setWorkspaceStateStatus(workspaceStateMeta.status, workspaceStateMeta.detail);
    function failureStatus(error) {
        var code = errorCode(error);
        if (code === 'ALLOWLIST_NOT_CONFIGURED') return 'Allowlist not configured';
        if (code === 'ALLOWLIST_INVALID') return 'Allowlist invalid';
        if (code === 'SESSION_REQUIRED') return 'Session required';
        if (code === 'PORTABLE_SESSION_EXPIRED') return 'Portable session expired';
        if (code === 'PORTABLE_SESSION_INVALID') return 'Portable session invalid';
        if (code === 'USER_NOT_AUTHORIZED') return 'User not authorized';
        if (code === 'AUTHORIZATION_PROVIDER_UNAVAILABLE') return 'Authorization unavailable';
        if (code === 'GOOGLE_REAUTH_REQUIRED') return 'Reauthorization required';
        if (/^GOOGLE_/.test(code)) return 'Provider unavailable';
        return error && error.status >= 500 ? 'Provider unavailable' : 'Failed';
    }

    function failureDetail(error, fallback) {
        return error && error.message ? error.message : fallback;
    }

    function isAuthorizationFailure(error) {
        var code = errorCode(error);
        return /^(ALLOWLIST_|USER_NOT_AUTHORIZED|AUTHORIZATION_|SESSION_REQUIRED|PORTABLE_SESSION_|GOOGLE_REAUTH_REQUIRED$)/.test(code)
            || (error && (error.status === 401 || error.status === 403) && !/^GOOGLE_/.test(code));
    }

    function authorizationBlockedDetail(code) {
        if (code === 'ALLOWLIST_INVALID') return 'Workspace authorization configuration is invalid. An administrator must update it before cloud access can be used.';
        if (code === 'ALLOWLIST_NOT_CONFIGURED') return 'Workspace authorization is not configured. An administrator must configure it before cloud access can be used.';
        if (code === 'USER_NOT_AUTHORIZED') return 'This signed-in user is not authorized for the workspace.';
        if (code === 'PORTABLE_SESSION_EXPIRED') return 'The portable cloud session expired. Connect a new session to continue.';
        if (code === 'PORTABLE_SESSION_INVALID') return 'The portable cloud session is invalid. Connect a new session to continue.';
        if (code === 'GOOGLE_REAUTH_REQUIRED') return 'Google Sheets authorization has expired. Sign back into the application, reauthorize the Google Sheets connection, then refresh protected status.';
        return 'Sign in to continue using protected cloud services.';
    }
})();
