(function () {
    'use strict';

    function quoteState() {
        var rfp = window.quoteExtracted && window.quoteExtracted.rfp || {};
        var currentQuote = window.currentQuote || window.__currentQuote || {};
        var selected = window.QuotePartySelector && typeof window.QuotePartySelector.currentSelection === 'function' && window.QuotePartySelector.currentSelection() || {};
        var brokerField = document.getElementById('v2-rfp-broker');
        var agentField = document.getElementById('v2-rfp-agent');
        var brokerText = String(selected.brokerageName || (brokerField && brokerField.value) || rfp.brokerageName || rfp.broker || rfp.brokerOrg || currentQuote.brokerageName || currentQuote.broker || '');
        var brokerParts = brokerText.split(/\s+\/\s+/);
        var cityField = document.getElementById('v2-rfp-citystatezip');
        var effectiveField = document.getElementById('v2-rfp-effective-date') || document.getElementById('v2-effective-date') || document.querySelector('[name="effectiveDate"]');
        var stateField = document.getElementById('v2-rfp-state');
        var city = String((cityField && cityField.value) || rfp.cityStateZip || rfp.city || '');
        var stateMatch = city.match(/,\s*([A-Z]{2})\b/);
        var brokerName = selected.brokerageName || brokerParts[0] || '';
        var agentName = selected.agentName || (agentField && agentField.value) || brokerParts[1] || rfp.agentName || rfp.producer || rfp.agent || currentQuote.agentName || currentQuote.producer || currentQuote.agent || '';
        var snapshot = window.LicensingSuite && typeof window.LicensingSuite.snapshot === 'function' && window.LicensingSuite.snapshot() || {};
        var brokerage = (snapshot.brokerages || []).find(function (item) {
            return String(selected.brokerageId || rfp.brokerageId || currentQuote.brokerageId || '') === String(item.id || '') ||
                String(item.name).toLowerCase() === String(brokerName).trim().toLowerCase();
        });
        if (brokerage) brokerName = brokerage.name;
        var agent = (snapshot.agents || []).find(function (item) {
            return (String(selected.agentId || rfp.agentId || currentQuote.agentId || '') === String(item.id || '') ||
                String(item.name).toLowerCase() === String(agentName).trim().toLowerCase()) &&
                (!brokerage || item.brokerageId === brokerage.id);
        });
        if (agent) agentName = agent.name;
        return {
            product: rfp.product || rfp.productLine || currentQuote.product || currentQuote.productLine || 'Group Stop Loss',
            reference: currentQuote.id || currentQuote.quoteId || rfp.quoteId || rfp.quote || '',
            carrier: rfp.carrier || currentQuote.carrier || '',
            carrierCode: rfp.carrierCode || rfp.coCode || currentQuote.carrierCode || currentQuote.coCode || '',
            brokerageName: brokerName,
            agentName: agentName,
            brokerageId: selected.brokerageId || rfp.brokerageId || currentQuote.brokerageId || '',
            agentId: selected.agentId || rfp.agentId || currentQuote.agentId || '',
            appointmentStatus: selected.appointmentStatus || rfp.appointmentStatus || currentQuote.appointmentStatus || '',
            state: selected.state || (stateField && stateField.value) || rfp.state || rfp.situsState || currentQuote.state || currentQuote.situsState || (stateMatch && stateMatch[1]) || '',
            effectiveDate: selected.effectiveDate || (effectiveField && effectiveField.value) || rfp.effective || rfp.effectiveDate || currentQuote.effective || currentQuote.effectiveDate || ''
        };
    }

    function guardSelection(label, selection, continuation) {
        if (!window.LicensingSuite) return Promise.resolve();
        var result = window.LicensingSuite.validateSelection(selection);
        if (!result.valid) {
            window.LicensingSuite.showBlock(label, result);
            return Promise.resolve();
        }
        if (typeof window.LicensingSuite.recordEvaluation === 'function') window.LicensingSuite.recordEvaluation(label + ' (client)', result, selection);
        if (result.advisory && result.advisory.length && typeof window.showTinubuNotice === 'function') window.showTinubuNotice(result.advisory[0].message, false);
        var apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/validate') : '/api/licensing/validate';
        return (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/validate', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selection)
        }) : fetch(apiUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selection)
        })).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok || !payload.valid) {
                    window.LicensingSuite.showBlock(label, {
                        valid: false,
                        reason: payload.error || 'Authoritative licensing validation did not approve this action.',
                        reasonCode: payload.reasonCode || payload.code,
                        evidence: payload.evidence,
                        hardBlock: payload.hardBlock !== false
                    });
                    return;
                }
                if (typeof window.LicensingSuite.recordEvaluation === 'function') window.LicensingSuite.recordEvaluation(label + ' (server)', payload, selection);
                if (payload.advisory && payload.advisory.length && typeof window.showTinubuNotice === 'function') window.showTinubuNotice(payload.advisory[0].message, false);
                // Binding has no issuance backend. This authorization is required
                // immediately before its legacy, client-side prototype action.
                return continuation();
            });
        }).catch(function () {
            window.LicensingSuite.showBlock(label, {
                valid: false,
                reasons: ['Authoritative licensing validation is unavailable. This action cannot continue.']
            });
        });
    }

    function opportunitySelection(opportunity) {
        var address = String(opportunity.address || '');
        var stateMatch = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
        var brokerText = String(opportunity.broker || opportunity.brokerOrg || '');
        var brokerParts = brokerText.split(/\s+\/\s+/);
        return {
            product: opportunity.product || opportunity.productLine || 'Group Stop Loss',
            reference: opportunity.id || '',
            carrier: opportunity.carrier || '',
            carrierCode: opportunity.carrierCode || opportunity.coCode || '',
            brokerageName: brokerParts[0] || '',
            agentName: opportunity.agent || opportunity.producer || brokerParts[1] || '',
            state: opportunity.state || opportunity.situsState || (stateMatch && stateMatch[1]) || '',
            effectiveDate: opportunity.effectiveDate || opportunity.effective || ''
        };
    }

    function hasCompleteSelection(selection) {
        return !!(selection.brokerageName && selection.agentName && selection.state && selection.effectiveDate);
    }

    function recordManualConversion(opportunity, selection) {
        var quote = window.quoteExtracted = window.quoteExtracted || {};
        quote.rfp = quote.rfp || {};
        quote.rfp.licensingSelectionPending = true;
        quote.rfp.licensingSelectionSource = 'Imported opportunity requires manual selection';
        window.TINUBU = window.TINUBU || {};
        window.TINUBU.audit = window.TINUBU.audit || [];
        window.TINUBU.audit.push({
            id: 'LIC-CONVERT-' + Date.now(),
            timestamp: new Date().toISOString(),
            action: 'LICENSED_PARTY_SELECTION_REQUIRED',
            details: 'Imported opportunity converted to Step 1 without a complete broker, licensed agent, state, and effective date selection.',
            entityId: opportunity.id || null,
            before: selection,
            after: { licensingSelectionPending: true }
        });
        if (typeof window.TINUBU.log === 'function') {
            window.TINUBU.log('LICENSING', 'Imported opportunity converted to Step 1; broker and licensed agent selection is required before quote progression.', opportunity.id || null, 'Selection required');
        }
    }

    function updateManualSelectionNotice() {
        var notice = document.getElementById('licensing-selection-required-notice');
        if (!notice) return;
        var selection = quoteState();
        var pending = window.quoteExtracted && window.quoteExtracted.rfp && window.quoteExtracted.rfp.licensingSelectionPending;
        notice.hidden = !pending;
    }

    function convertOpportunityWithLicensing(id, original, self, args) {
        var opportunity = (window.CRMX && window.CRMX.opps || []).find(function (item) { return item.id === id; }) || {};
        var selection = opportunitySelection(opportunity);
        if (hasCompleteSelection(selection)) {
            return guardSelection('opportunity conversion', selection, function () {
                return original.apply(self, args);
            });
        }
        var result = original.apply(self, args);
        recordManualConversion(opportunity, selection);
        updateManualSelectionNotice();
        if (typeof window.showTinubuNotice === 'function') {
            window.showTinubuNotice('Imported opportunity opened in Quote Step 1. Select both a licensed brokerage and licensed agent before Step 6 or later.', true);
        }
        return result;
    }

    function wrap(name, label, selectionFactory) {
        var original = window[name];
        if (typeof original !== 'function' || original._licensingGuarded) return;
        var wrapped = function () {
            var self = this, args = arguments;
            if (name === 'convertOpportunityToQuote') return convertOpportunityWithLicensing(args[0], original, self, args);
            var selection = selectionFactory ? selectionFactory.apply(self, args) : quoteState();
            return guardSelection(label, selection, function () { return original.apply(self, args); });
        };
        wrapped._licensingGuarded = true;
        window[name] = wrapped;
    }

    function wire() {
        wrap('convertOpportunityToQuote', 'opportunity conversion', function (id) {
            var opportunity = (window.CRMX && window.CRMX.opps || []).find(function (item) { return item.id === id; }) || {};
            return opportunitySelection(opportunity);
        });
        wrap('bindCurrentQuote', 'quote binding and policy issuance');
        var originalStep = window.goToV2Step;
        if (typeof originalStep === 'function' && !originalStep._licensingGuarded) {
            window.goToV2Step = function (step) {
                var self = this, args = arguments;
                if (Number(step) < 6) return originalStep.apply(self, args);
                return guardSelection('quote progression', quoteState(), function () { return originalStep.apply(self, args); });
            };
            window.goToV2Step._licensingGuarded = true;
        }
        document.addEventListener('quotePartySelectionChanged', updateManualSelectionNotice);
        setTimeout(updateManualSelectionNotice, 0);
    }

    window.addEventListener('load', wire);
    setTimeout(wire, 0);
})();