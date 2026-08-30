(function () {
    'use strict';
    var version = 'ah-state-licensing-2026-05-28';
    var source = { file: 'A&H_State_Licensing_5-28-2026.xlsx', effectiveDate: '2026-05-28', description: 'A&H state licensing and producer appointment workbook' };
    var entityOnly = { AL:'P&C or A&H authority', AK:'A&H (Health) authority', AZ:'A&H authority', AR:'A&H authority', CA:'A&H authority', CO:'A&H authority', CT:'A&H authority', DE:'A&H authority', DC:'P&C or A&H authority', FL:'P&C or A&H (Health) authority', GA:'P&C or A&H (A&S) authority', HI:'A&H authority', ID:'A&H (Disability) authority', IL:'A&H authority', IN:'A&H authority', KS:'A&H authority', KY:'P&C or A&H authority', LA:'A&H authority', ME:'A&H authority', MD:'A&H (Health) authority', MA:'A&H authority', MI:'A&H authority', MN:'A&H authority', MS:'A&H authority', MO:'A&H authority', MT:'A&H (Disability) authority', NE:'A&H authority', NV:'A&H authority', NH:'A&H authority', NJ:'A&H authority', NM:'P&C or A&H authority', NY:'P&C or A&H authority', NC:'A&H authority', ND:'A&H authority', OH:'A&H authority', OK:'A&H authority', OR:'A&H (Health) authority', PA:'A&H authority', SC:'A&H authority', SD:'A&H authority', TX:'P&C or General Life, Accident & Health authority', UT:'A&H authority', VA:'A&H (Health) authority', WA:'A&H (Disability) authority', WV:'A&H authority', WY:'A&H authority' };
    var allStates = Object.keys(entityOnly).concat(['IA','RI','TN','VT','WI']);
    var party = { IA:'individuals', RI:'individuals', TN:'individuals', VT:'individuals', WI:'individuals' };
    var appt = {
        AL:['pre-appointment','entity-and-individuals',null,null], AK:['jit','case-by-case',null,null], AZ:['not-required','entity-and-individuals',null,null], AR:['jit','case-by-case',null,null], CA:['jit','case-by-case',null,null], CO:['not-required','entity-and-individuals',null,null], CT:['pre-appointment','entity-and-individuals',null,null], DE:['jit','case-by-case',null,null], DC:['jit','case-by-case',null,null], FL:['jit','individual',15,250], GA:['pre-appointment','individual',null,null], HI:['pre-appointment','entity-and-individuals',null,null], ID:['pre-appointment','entity-and-individuals',null,null], IL:['jit','entity-and-individuals',30,50], IN:['pre-appointment','entity-and-individuals',null,null], IA:['jit','individual',null,null], KS:['pre-appointment','entity-and-individuals',null,null], KY:['pre-appointment','entity-and-individuals',null,null], LA:['pre-appointment','entity-and-individuals',null,null], ME:['pre-appointment','entity-and-individuals',null,null], MD:['pre-appointment','entity-and-individuals',null,null], MA:['pre-appointment','entity-and-individuals',null,null], MI:['pre-appointment','entity-and-individuals',null,null], MN:['pre-appointment','individual',null,null], MS:['pre-appointment','individual',null,null], MO:['jit','case-by-case',null,null], MT:['pre-appointment','entity-and-individuals',null,null], NE:['pre-appointment','individual',null,null], NV:['pre-appointment','entity-and-individuals',null,null], NH:['pre-appointment','entity-and-individuals',null,null], NJ:['pre-appointment','case-by-case',null,40], NM:['jit','individual',null,null], NY:['register-only','case-by-case',null,20], NC:['jit','individual',null,null], ND:['jit','entity-and-individuals',null,null], OH:['pre-appointment','entity-and-individuals',null,null], OK:['jit','entity-and-individuals',null,null], OR:['pre-appointment','entity-and-individuals',null,null], PA:['jit','case-by-case',null,15], RI:['not-required','entity-and-individuals',null,null], SC:['jit','individual',null,null], SD:['pre-appointment','entity-and-individuals',null,null], TN:['pre-appointment','individual',null,null], TX:['pre-appointment','entity-and-individuals',15,20], UT:['jit','case-by-case',null,null], VT:['jit','individual',null,null], VA:['pre-appointment','entity-and-individuals',null,null], WA:['jit','entity-and-individuals',null,null], WV:['pre-appointment','individual',null,null], WI:['pre-appointment','individual',null,null], WY:['jit','entity-and-individuals',null,null]
    };
    var overrides = { PA:'pre-appointment', NJ:'pre-appointment', TX:'jit' };
    Object.keys(overrides).forEach(function (state) { appt[state][0] = overrides[state]; });
    function rule(id, state, requiredParty) {
        return { id:id, state:state, licenseType:entityOnly[state], lineOfAuthority:'Accident & Health', requiredParty:requiredParty, sourceVersion:version, sourceFile:source.file, sourceEffectiveDate:source.effectiveDate };
    }
    var entityRules = Object.keys(entityOnly).map(function (state) { return rule('AH-ENTITY-' + state, state, 'entity'); });
    var individualRules = allStates.map(function (state) { return rule('AH-INDIVIDUAL-' + state, state, 'individual'); });
    var appointmentRules = allStates.map(function (state) {
        var row = appt[state] || ['not-required','entity-and-individuals',null,null];
        return { id:'AH-APPOINTMENT-' + state, state:state, ruleType:row[0], requiredParty:row[1], filingWindowDays:row[2], fee:row[3], sourceVersion:version, sourceFile:source.file, sourceEffectiveDate:source.effectiveDate };
    });
    var codes = {
        INVALID_EFFECTIVE_DATE:'INVALID_EFFECTIVE_DATE', UNSUPPORTED_STATE:'UNSUPPORTED_STATE', BROKERAGE_NOT_FOUND:'BROKERAGE_NOT_FOUND',
        BROKERAGE_INACTIVE:'BROKERAGE_INACTIVE', BROKERAGE_INVALID_DATES:'BROKERAGE_INVALID_DATES', BROKERAGE_NOT_YET_EFFECTIVE:'BROKERAGE_NOT_YET_EFFECTIVE',
        BROKERAGE_EXPIRED:'BROKERAGE_EXPIRED', BROKERAGE_STATE_UNAUTHORIZED:'BROKERAGE_STATE_UNAUTHORIZED', BROKERAGE_AH_AUTHORITY_MISSING:'BROKERAGE_AH_AUTHORITY_MISSING',
        BROKERAGE_CLASSIFICATION_INVALID:'BROKERAGE_CLASSIFICATION_INVALID',
        AGENT_NOT_FOUND:'AGENT_NOT_FOUND', AGENT_INACTIVE:'AGENT_INACTIVE', AGENT_INVALID_DATES:'AGENT_INVALID_DATES', AGENT_NOT_YET_EFFECTIVE:'AGENT_NOT_YET_EFFECTIVE',
        AGENT_EXPIRED:'AGENT_EXPIRED', AGENT_AH_AUTHORITY_MISSING:'AGENT_AH_AUTHORITY_MISSING', AGENT_CLASSIFICATION_INVALID:'AGENT_CLASSIFICATION_INVALID', AGENT_LICENSE_MISSING:'AGENT_LICENSE_MISSING',
        AGENT_LICENSE_INACTIVE:'AGENT_LICENSE_INACTIVE', AGENT_LICENSE_INVALID_DATES:'AGENT_LICENSE_INVALID_DATES', AGENT_LICENSE_NOT_YET_EFFECTIVE:'AGENT_LICENSE_NOT_YET_EFFECTIVE',
        AGENT_LICENSE_EXPIRED:'AGENT_LICENSE_EXPIRED', APPOINTMENT_ADVISORY:'APPOINTMENT_ADVISORY'
    };
    function hasAh(value, type) {
        var raw = Array.isArray(value) ? value.map(function (item) { return typeof item === 'object' ? JSON.stringify(item) : String(item); }).join(' ') : typeof value === 'object' && value ? JSON.stringify(value) : String(value || '');
        raw = raw.toLowerCase();
        if (!raw || !/a\s*&\s*h|accident\s*(?:&|and)\s*health|health|disability|life\s*&\s*health/.test(raw)) return false;
        if (/disability/.test(String(type || '').toLowerCase())) return /disability|a\s*&\s*h|health/.test(raw);
        return true;
    }
    function getRules(state) {
        state = String(state || '').trim().toUpperCase();
        return { entity:entityRules.find(function (x) { return x.state === state; }), individual:individualRules.find(function (x) { return x.state === state; }), appointment:appointmentRules.find(function (x) { return x.state === state; }) };
    }
    function appointment(state, status, partyType) {
        var rule = getRules(state).appointment;
        if (!rule) return { rule:rule, advisory:null, outcome:'RULE_UNAVAILABLE' };
        if (rule.ruleType === 'not-required' || (rule.requiredParty === 'entity' && partyType === 'individual')) return { rule:rule, advisory:null, outcome:'NO_APPOINTMENT_REQUIRED' };
        if (/^(appointed|active)$/i.test(String(status || '').trim())) return { rule:rule, advisory:null, outcome:'APPOINTMENT_ACTIVE' };
        var outcome = rule.ruleType === 'pre-appointment' ? 'REVIEW_PRE_APPOINTMENT' : rule.ruleType === 'jit' ? 'QUEUE_JIT_FILING' : 'QUEUE_REGISTRATION';
        return { rule:rule, outcome:outcome, advisory:{ code:codes.APPOINTMENT_ADVISORY, message:state + ' uses ' + rule.ruleType + '; confirm the producer appointment before binding.', severity:'warning' } };
    }
    window.TinubuLicensingRules = { schemaVersion:1, version:version, source:source, entityRules:entityRules, individualRules:individualRules, appointmentRules:appointmentRules, reasonCodes:codes, getRules:getRules, hasAhAuthority:hasAh, evaluateAppointment:appointment };
}());