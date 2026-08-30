(function () {
    'use strict';
    var selected = { broker: null, agent: null, tpa: null, program: null };
    var contextOverride = { state: '', effective: '' };

    function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
    function el(id) { return document.getElementById(id); }
    function value(id) { var e = el(id); return e ? String(e.value || '').trim() : ''; }
    function date(v) {
        var s = String(v || '').trim(), m = s.match(/^(\d{4})-(\d\d)-(\d\d)$/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return '';
        var y = m.length === 4 && m[1].length === 4 ? +m[1] : +m[3], mo = m.length === 4 && m[1].length === 4 ? +m[2] : +m[1], day = m.length === 4 && m[1].length === 4 ? +m[3] : +m[2];
        var x = new Date(Date.UTC(y, mo - 1, day));
        return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === day ? y + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0') : '';
    }
    function context() {
        var r = window.quoteExtracted && window.quoteExtracted.rfp || {}, p = window.currentQuote || window.__currentQuote || {};
        var city = value('v2-rfp-citystatezip') || r.cityStateZip || r.city || '', match = city.match(/,\s*([A-Z]{2})\b/i);
        return {
            state: (value('v2-rfp-state') || contextOverride.state || r.state || r.situsState || p.state || p.situsState || (match && match[1]) || '').toUpperCase(),
            effective: date(value('v2-rfp-effective-date') || contextOverride.effective || r.effective || r.effectiveDate || p.effective || p.effectiveDate || ''),
            product: r.product || p.product || 'Stop Loss',
            reference: p.id || p.quoteId || r.quote || 'Q-2026-99205'
        };
    }
    function snapshot() { return window.LicensingSuite && window.LicensingSuite.snapshot ? window.LicensingSuite.snapshot() : { brokerages: [], agents: [], stateLicenses: [] }; }
    function datesCover(item, target) {
        return !!target && !!date(item.effectiveDate) && !!date(item.expirationDate) && date(item.effectiveDate) <= target && date(item.expirationDate) >= target;
    }
    function readyNotice() {
        var c = context();
        if (!c.state || c.state === 'GEN' || !c.effective) return 'Complete the policyholder state and valid effective date before selecting a licensed brokerage or agent.';
        return '';
    }
    function audit(action, before, after) {
        var c = context(), entry = { id: 'QPS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), timestamp: new Date().toISOString(), action: action, before: before, after: after, state: c.state, effectiveDate: c.effective, actor: (window.Clerk && window.Clerk.user && window.Clerk.user.primaryEmailAddress && window.Clerk.user.primaryEmailAddress.emailAddress) || 'Authorized workspace user', context: 'Stop Loss quote party selector', reference: c.reference };
        window.TINUBU = window.TINUBU || {}; window.TINUBU.audit = window.TINUBU.audit || []; window.TINUBU.audit.push(entry);
        if (typeof window.TINUBU.log === 'function') window.TINUBU.log('QUOTE_PARTY', action + ' | ' + JSON.stringify({ before: before, after: after, state: c.state, effectiveDate: c.effective }), c.reference, 'Updated');
    }
    function syncQuote() {
        var r = window.quoteExtracted = window.quoteExtracted || {}; r.rfp = r.rfp || {};
        var q = window.currentQuote || window.__currentQuote;
        var p = window.TINUBU && typeof window.TINUBU.policy === 'function' && window.TINUBU.policy(window.TINUBU.currentPolicy);
        var c = context();
        [r.rfp, q, p].filter(Boolean).forEach(function (target) {
            if (c.state) { target.state = c.state; target.situsState = c.state; }
            if (c.effective) { target.effective = c.effective; target.effectiveDate = c.effective; }
            if (selected.broker) {
                target.broker = selected.broker.name;
                target.brokerOrg = selected.broker.name;
                target.brokerageId = selected.broker.id || '';
                target.brokerageName = selected.broker.name;
                target.brokerNo = selected.broker.brokerNumber || selected.broker.brokerCode || '';
            }
            if (selected.agent) {
                target.agent = selected.agent.name;
                target.producer = selected.agent.name;
                target.agentId = selected.agent.id || '';
                target.agentName = selected.agent.name;
                target.agentLicenseNumber = selected.agent.licenseNumber || '';
            }
            if (selected.tpa) { target.tpa = selected.tpa.name; target.claimsAdmin = selected.tpa.name; target.tpaType = selected.tpa.type || ''; }
            if (selected.program) target.programName = selected.program;
        });
        if (selected.broker) el('v2-rfp-broker-no').value = selected.broker.brokerNumber || selected.broker.brokerCode || '';
        if (selected.agent) el('v2-rfp-agent-license-no').value = selected.agent.licenseNumber || '';
        if (selected.broker && selected.agent && window.LicensingSuite &&
            window.LicensingSuite.validateSelection({ brokerageName: selected.broker.name, agentName: selected.agent.name, state: c.state, effectiveDate: c.effective }).valid) {
            r.rfp.licensingSelectionPending = false;
        }
        document.dispatchEvent(new CustomEvent('quotePartySelectionChanged'));
    }
    function status(text, source) { return '<span class="badge badge-info">' + esc(source) + '</span><div class="qps-status">' + esc(text) + '</div>'; }
    function render() {
        var root = el('quote-party-selector'); if (!root) return;
        var c = context(), brokerFallback = value('v2-rfp-broker'), tpaFallback = value('v2-rfp-tpa'), programFallback = value('v2-rfp-program-name');
        var states = [].concat.apply([], snapshot().brokerages.map(function (b) { return b.states || []; })).filter(function (state, index, list) { return state && list.indexOf(state) === index; }).sort();
        if (c.state && states.indexOf(c.state) < 0) states.unshift(c.state);
        root.innerHTML = '<div class="qps-context"><div><label for="v2-rfp-state">Policyholder state</label><select id="v2-rfp-state" class="form-control"><option value="">Select state</option>' + states.map(function (state) { return '<option value="' + esc(state) + '"' + (state === c.state ? ' selected' : '') + '>' + esc(state) + '</option>'; }).join('') + '</select></div><div><label for="v2-rfp-effective-date">Quote effective date</label><input id="v2-rfp-effective-date" type="date" class="form-control" value="' + esc(c.effective) + '"></div></div>' +
            '<div class="qps-rows">' +
            row('Broker', selected.broker ? selected.broker.name : brokerFallback || 'Not selected', selected.broker ? 'Selected; licensing snapshot validated' : 'Source value retained; select to validate', 'LicensingSuite snapshot', 'broker', true, false) +
            row('Licensed Agent', selected.agent ? selected.agent.name : 'Not selected', selected.agent ? 'Selected; active state license verified' : 'Required with selected broker', 'LicensingSuite snapshot', 'agent', true, !selected.broker) +
            row('TPA Partner', selected.tpa ? selected.tpa.name : tpaFallback || 'Not selected', selected.tpa ? (selected.tpa.type || 'TPA') : 'Source value retained; select or add from relationships', 'Relationships index', 'tpa', false, false, true) +
             row('Program Name', selected.program || programFallback || 'Not selected', selected.program ? 'Selected program' : 'August 2026 Program sheet', 'August 2026 Program sheet', 'program', false, false) +
             '</div><div class="qps-identifiers"><span>Broker number <strong>' + esc(selected.broker && (selected.broker.brokerNumber || selected.broker.brokerCode) || value('v2-rfp-broker-no') || '—') + '</strong></span><span>Agent license number <strong>' + esc(selected.agent && selected.agent.licenseNumber || value('v2-rfp-agent-license-no') || '—') + '</strong></span></div>';
        root.querySelectorAll('[data-qps-open]').forEach(function (b) { b.onclick = function () { open(b.dataset.qpsOpen); }; });
        root.querySelectorAll('[data-qps-license]').forEach(function (b) { b.onclick = function () { licenseView(b.dataset.qpsLicense); }; });
        root.querySelectorAll('#v2-rfp-state,#v2-rfp-effective-date').forEach(function (input) { input.onchange = function () { contextOverride.state = value('v2-rfp-state'); contextOverride.effective = value('v2-rfp-effective-date'); render(); }; });
    }
    function row(label, val, detail, source, kind, license, disabled, add) {
        return '<div class="qps-row"><div class="qps-label">' + label + '</div><div class="qps-value"><strong>' + esc(val) + '</strong><small>' + esc(detail) + '</small></div><div>' + status(source, '') + '</div><div class="qps-actions"><button type="button" class="btn btn-primary btn-sm" data-qps-open="' + kind + '"' + (disabled ? ' disabled' : '') + '>' + (val === 'Not selected' ? 'Select' : 'Change') + '</button>' + (license ? '<button type="button" class="btn btn-secondary btn-sm" data-qps-license="' + kind + '"' + (disabled ? ' disabled' : '') + '>View License</button>' : '') + (add ? '<button type="button" class="btn btn-secondary btn-sm" data-qps-open="add-tpa">Add TPA</button>' : '') + '</div></div>';
    }
    function overlay(title, body) {
        var old = el('qps-overlay'); if (old) old.remove();
        var o = document.createElement('div'); o.id = 'qps-overlay'; o.className = 'modal-overlay qps-modal'; o.style.display = 'flex';
        o.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>' + esc(title) + '</h3><button type="button" class="modal-close">&times;</button></div><div class="modal-body">' + body + '</div><div class="modal-footer"><button type="button" class="btn btn-secondary qps-close">Close</button></div></div>';
        document.body.appendChild(o); o.querySelector('.modal-close').onclick = o.querySelector('.qps-close').onclick = function () { o.remove(); }; return o;
    }
    function open(kind) {
        if (kind === 'add-tpa') return addTpa();
        if ((kind === 'broker' || kind === 'agent') && readyNotice()) return overlay('Selection blocked', '<div class="qps-notice">' + esc(readyNotice()) + '</div>');
        if (kind === 'broker') return brokers(); if (kind === 'agent') return agents(); if (kind === 'tpa') return tpas(); programs();
    }
    function brokers() {
        var c = context(), s = snapshot();
        var cards = (s.brokerages || []).map(function (b) {
            var reason = b.status !== 'Active' ? 'Inactive brokerage' : !(b.states || []).includes(c.state) ? 'Not licensed in ' + c.state : !datesCover(b, c.effective) ? 'Authority is not effective for quote date' : '';
            return choice(b.name, 'States: ' + (b.states || []).join(', ') + '<br>Effective: ' + (b.effectiveDate || 'missing') + ' · Expires: ' + (b.expirationDate || 'missing') + '<br>Status: ' + (b.status || 'missing'), reason, 'broker', b.id);
        }).join('') || '<p>No brokerages are present in the LicensingSuite snapshot.</p>';
        var o = overlay('Select licensed brokerage', '<p class="qps-notice">State ' + esc(c.state) + ' · Effective ' + esc(c.effective) + ' · Product ' + esc(c.product) + '</p><div class="qps-list">' + cards + '</div>');
        wireChoices(o, 'broker', s);
    }
    function agents() {
        var c = context(), s = snapshot(), b = selected.broker;
        if (!b) return overlay('Select licensed agent', '<div class="qps-notice">Select an eligible brokerage first.</div>');
        var hasAffiliations = (s.agents || []).some(function (a) { return !!a.brokerageId; });
        var cards = (s.agents || []).filter(function (a) { return !hasAffiliations || !a.brokerageId || a.brokerageId === b.id; }).map(function (a) {
            var ls = (s.stateLicenses || []).filter(function (l) { return l.agentId === a.id && l.state === c.state; });
            var l = ls[0], valid = a.status === 'Active' && ls.some(function (x) { return x.status === 'Active' && datesCover(x, c.effective); });
            var reason = valid ? '' : a.status !== 'Active' ? 'Inactive agent' : !l ? 'No license in ' + c.state : 'License is inactive, expired, or not yet effective';
            return choice(a.name, 'License: ' + (l && (l.licenseNumber || l.number) || 'missing') + '<br>Effective: ' + (l && l.effectiveDate || 'missing') + ' · Expires: ' + (l && l.expirationDate || 'missing') + '<br>Status: ' + (l && l.status || 'missing') + (l && (l.product || l.lineOfAuthority) ? ' · ' + (l.product || l.lineOfAuthority) : ''), reason, 'agent', a.id);
        }).join('') || '<p>No eligible agents are present in the LicensingSuite snapshot.</p>';
        var o = overlay('Select licensed agent — ' + b.name, '<div class="qps-list">' + cards + '</div>'); wireChoices(o, 'agent', s);
    }
    function choice(name, meta, reason, kind, id) { return '<div class="qps-choice' + (reason ? ' ineligible' : '') + '"><div><strong>' + esc(name) + '</strong></div><div class="qps-choice-meta">' + esc(String(meta).replace(/<br\s*\/?>/gi, '\n')).replace(/\n/g, '<br>') + (reason ? '<div class="qps-choice-reason">' + esc(reason) + '</div>' : '') + '</div><button class="btn btn-primary btn-sm" type="button" data-qps-select="' + kind + '" data-id="' + esc(id) + '"' + (reason ? ' disabled' : '') + '>Select</button></div>'; }
    function wireChoices(o, kind, s) { o.querySelectorAll('[data-qps-select]').forEach(function (b) { b.onclick = function () { select(kind, b.dataset.id, s); o.remove(); }; }); }
    function select(kind, id, s) {
        var before = selected[kind] && selected[kind].name || '', item = kind === 'broker' ? (s.brokerages || []).find(function (x) { return x.id === id; }) : (s.agents || []).find(function (x) { return x.id === id; });
        if (!item) return;
        if (kind === 'agent') { var c = context(), validation = window.LicensingSuite.validateSelection({ brokerageName: selected.broker.name, agentName: item.name, state: c.state, effectiveDate: c.effective }); if (!validation.valid) return overlay('Selection blocked', '<div class="qps-notice">' + esc(validation.reason) + '</div>'); }
        if (kind === 'broker' && selected.agent && selected.agent.brokerageId !== item.id) { audit('LICENSED_AGENT_CLEARED', selected.agent.name, ''); selected.agent = null; }
        selected[kind] = item;
        if (kind === 'broker') { el('v2-rfp-broker').value = item.name; el('v2-rfp-broker-no').value = item.brokerNumber || item.brokerCode || ''; }
        if (kind === 'agent') { el('v2-rfp-broker').value = selected.broker.name + ' / ' + item.name; el('v2-rfp-agent-license-no').value = item.licenseNumber || ''; }
        audit(kind === 'broker' ? 'BROKER_CHANGED' : 'LICENSED_AGENT_CHANGED', before, item.name); syncQuote(); render();
    }
    function tpas() {
        var all = [].concat(window.CRMX && window.CRMX.relationships || [], window.TINUBU && window.TINUBU.contacts || []);
        var r = window.quoteExtracted && window.quoteExtracted.rfp || {}, q = window.currentQuote || window.__currentQuote || {}, p = window.TINUBU && typeof window.TINUBU.policy === 'function' && window.TINUBU.policy(window.TINUBU.currentPolicy) || {};
        [value('v2-rfp-tpa'), r.tpa, r.claimsAdmin, q.tpa, q.claimsAdmin, p.tpa, p.claimsAdmin].filter(Boolean).forEach(function (name) { if (!all.some(function (x) { return x.name === name; })) all.push({ id: 'quote-source-' + name, name: name, type: value('v2-rfp-tpa-type') || 'TPA', source: 'Relationships index' }); });
        var uniq = all.filter(function (x, i) { return /tpa|third.party administrator/i.test(x.type || x.role || '') && all.findIndex(function (y) { return y.name === x.name; }) === i; });
        var o = overlay('Select TPA partner', '<p class="qps-notice">Source: Relationships index</p><div class="qps-list">' + (uniq.map(function (x) { return choice(x.name, 'Type: ' + esc(x.type || x.role || 'TPA') + (x.state || x.region ? '<br>Region: ' + esc(x.state || x.region) : ''), '', 'tpa', x.id); }).join('') || '<p>No TPA relationships available. Use Add TPA.</p>') + '</div>');
        o.querySelectorAll('[data-qps-select]').forEach(function (b) { b.onclick = function () { var x = uniq.find(function (y) { return String(y.id) === b.dataset.id; }); var before = selected.tpa && selected.tpa.name || value('v2-rfp-tpa'); selected.tpa = x; el('v2-rfp-tpa').value = x.name; el('v2-rfp-tpa-type').value = x.type || 'Full Service Third-Party Administrator'; audit('TPA_CHANGED', before, x.name); syncQuote(); o.remove(); render(); }; });
    }
    function addTpa() {
        var o = overlay('Add TPA relationship', '<form id="qps-tpa-form"><div class="qps-add-form"><div><label>Name</label><input required name="name" class="form-control"></div><div><label>Type</label><input required name="type" class="form-control" value="TPA"></div><div><label>State / region</label><input name="region" class="form-control"></div><div class="full"><label>Notes</label><textarea name="notes" class="form-control"></textarea></div></div><div class="modal-footer" style="padding:16px 0 0"><button class="btn btn-primary">Add TPA</button></div></form>');
        o.querySelector('form').onsubmit = function (e) { e.preventDefault(); var f = e.target, x = { id: 'REL-TPA-' + Date.now(), name: f.name.value.trim(), type: f.type.value.trim(), state: f.region.value.trim(), notes: f.notes.value.trim(), source: 'Relationships index' }; window.CRMX = window.CRMX || {}; window.CRMX.relationships = window.CRMX.relationships || []; window.CRMX.relationships.push(x); window.TINUBU = window.TINUBU || {}; window.TINUBU.contacts = window.TINUBU.contacts || []; window.TINUBU.contacts.push({ id: x.id + '-CONTACT', name: x.name, type: x.type, relationshipId: x.id, state: x.state, notes: x.notes, source: x.source }); audit('TPA_ADDED', '', x.name); o.remove(); tpas(); };
    }
    function programs() {
        var programs = window.TinubuIndex && window.TinubuIndex.programs || [];
        var o = overlay('Select program name', '<p class="qps-notice">Source: August 2026 Program sheet</p><div class="qps-list">' + programs.map(function (p) { return choice(p, 'August 2026 Program sheet', '', 'program', p); }).join('') + '</div>');
        o.querySelectorAll('[data-qps-select]').forEach(function (b) { b.onclick = function () { var before = selected.program || value('v2-rfp-program-name'); selected.program = b.dataset.id; el('v2-rfp-program-name').value = selected.program; audit('PROGRAM_CHANGED', before, selected.program); syncQuote(); o.remove(); render(); }; });
    }
    function licenseView(kind) {
        var item = selected[kind]; if (!item) return overlay('License details', '<div class="qps-notice">Select ' + (kind === 'broker' ? 'a brokerage' : 'an agent') + ' first.</div>');
        var s = snapshot(), details = kind === 'agent' ? (s.stateLicenses || []).filter(function (l) { return l.agentId === item.id; }) : [item];
        overlay('License details — ' + item.name, '<div class="qps-list">' + details.map(function (x) { return '<div class="qps-choice"><div><strong>' + esc(x.state || 'Brokerage authority') + '</strong></div><div class="qps-choice-meta">License: ' + esc(x.licenseNumber || x.number || '—') + '<br>Effective: ' + esc(x.effectiveDate || '—') + ' · Expires: ' + esc(x.expirationDate || '—') + '<br>Status: ' + esc(x.status || '—') + '</div></div>'; }).join('') + '</div>');
    }
    function init() { render(); }
    window.QuotePartySelector = {
        refresh: render,
        currentSelection: function () {
            var c = context();
            return {
                brokerage: selected.broker,
                agent: selected.agent,
                brokerageId: selected.broker && selected.broker.id || '',
                brokerageName: selected.broker && selected.broker.name || '',
                agentId: selected.agent && selected.agent.id || '',
                agentName: selected.agent && selected.agent.name || '',
                state: c.state,
                effectiveDate: c.effective
            };
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());