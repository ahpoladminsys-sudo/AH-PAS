// test/licensing-rules.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

// src/lib/licensing-rules.ts
var AH_RULES_VERSION = "ah-state-licensing-2026-05-28";
var AH_RULES_SOURCE_FILE = "A&H_State_Licensing_5-28-2026.xlsx";
var AH_RULES_SOURCE_DATE = "2026-05-28";
var LICENSING_REASON_CODES = {
  INVALID_EFFECTIVE_DATE: "INVALID_EFFECTIVE_DATE",
  UNSUPPORTED_STATE: "UNSUPPORTED_STATE",
  BROKERAGE_NOT_FOUND: "BROKERAGE_NOT_FOUND",
  BROKERAGE_INACTIVE: "BROKERAGE_INACTIVE",
  BROKERAGE_INVALID_DATES: "BROKERAGE_INVALID_DATES",
  BROKERAGE_NOT_YET_EFFECTIVE: "BROKERAGE_NOT_YET_EFFECTIVE",
  BROKERAGE_EXPIRED: "BROKERAGE_EXPIRED",
  BROKERAGE_STATE_UNAUTHORIZED: "BROKERAGE_STATE_UNAUTHORIZED",
  BROKERAGE_AH_AUTHORITY_MISSING: "BROKERAGE_AH_AUTHORITY_MISSING",
  BROKERAGE_CLASSIFICATION_INVALID: "BROKERAGE_CLASSIFICATION_INVALID",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  AGENT_INACTIVE: "AGENT_INACTIVE",
  AGENT_INVALID_DATES: "AGENT_INVALID_DATES",
  AGENT_NOT_YET_EFFECTIVE: "AGENT_NOT_YET_EFFECTIVE",
  AGENT_EXPIRED: "AGENT_EXPIRED",
  AGENT_AH_AUTHORITY_MISSING: "AGENT_AH_AUTHORITY_MISSING",
  AGENT_CLASSIFICATION_INVALID: "AGENT_CLASSIFICATION_INVALID",
  AGENT_LICENSE_MISSING: "AGENT_LICENSE_MISSING",
  AGENT_LICENSE_INACTIVE: "AGENT_LICENSE_INACTIVE",
  AGENT_LICENSE_INVALID_DATES: "AGENT_LICENSE_INVALID_DATES",
  AGENT_LICENSE_NOT_YET_EFFECTIVE: "AGENT_LICENSE_NOT_YET_EFFECTIVE",
  AGENT_LICENSE_EXPIRED: "AGENT_LICENSE_EXPIRED",
  APPOINTMENT_ADVISORY: "APPOINTMENT_ADVISORY"
};
var stateRows = [
  ["AL", "P&C or A&H authority", "entity-and-individuals"],
  ["AK", "A&H (Health) authority", "entity-and-individuals"],
  ["AZ", "A&H authority", "entity-and-individuals"],
  ["AR", "A&H authority", "entity-and-individuals"],
  ["CA", "A&H authority", "entity-and-individuals"],
  ["CO", "A&H authority", "entity-and-individuals"],
  ["CT", "A&H authority", "entity-and-individuals"],
  ["DE", "A&H authority", "entity-and-individuals"],
  ["DC", "P&C or A&H authority", "entity-and-individuals"],
  ["FL", "P&C or A&H (Health) authority", "entity-and-individuals"],
  ["GA", "P&C or A&H (A&S) authority", "entity-and-individuals"],
  ["HI", "A&H authority", "entity-and-individuals"],
  ["ID", "A&H (Disability) authority", "entity-and-individuals"],
  ["IL", "A&H authority", "entity-and-individuals"],
  ["IN", "A&H authority", "entity-and-individuals"],
  ["IA", "A&H authority", "individuals"],
  ["KS", "A&H authority", "entity-and-individuals"],
  ["KY", "P&C or A&H authority", "entity-and-individuals"],
  ["LA", "A&H authority", "entity-and-individuals"],
  ["ME", "A&H authority", "entity-and-individuals"],
  ["MD", "A&H (Health) authority", "entity-and-individuals"],
  ["MA", "A&H authority", "entity-and-individuals"],
  ["MI", "A&H authority", "entity-and-individuals"],
  ["MN", "A&H authority", "entity-and-individuals"],
  ["MS", "A&H authority", "entity-and-individuals"],
  ["MO", "A&H authority", "entity-and-individuals"],
  ["MT", "A&H (Disability) authority", "entity-and-individuals"],
  ["NE", "A&H authority", "entity-and-individuals"],
  ["NV", "A&H authority", "entity-and-individuals"],
  ["NH", "A&H authority", "entity-and-individuals"],
  ["NJ", "A&H authority", "entity-and-individuals"],
  ["NM", "P&C or A&H authority", "entity-and-individuals"],
  ["NY", "P&C or A&H authority", "entity-and-individuals"],
  ["NC", "A&H authority", "entity-and-individuals"],
  ["ND", "A&H authority", "entity-and-individuals"],
  ["OH", "A&H authority", "entity-and-individuals"],
  ["OK", "A&H authority", "entity-and-individuals"],
  ["OR", "A&H (Health) authority", "entity-and-individuals"],
  ["PA", "A&H authority", "entity-and-individuals"],
  ["RI", "P&C or A&H authority", "individuals"],
  ["SC", "A&H authority", "entity-and-individuals"],
  ["SD", "A&H authority", "entity-and-individuals"],
  ["TN", "A&H authority", "individuals"],
  ["TX", "P&C or General Life, Accident & Health authority", "entity-and-individuals"],
  ["UT", "A&H authority", "entity-and-individuals"],
  ["VT", "A&H authority", "individuals"],
  ["VA", "A&H (Health) authority", "entity-and-individuals"],
  ["WA", "A&H (Disability) authority", "entity-and-individuals"],
  ["WV", "A&H authority", "entity-and-individuals"],
  ["WI", "A&H authority", "individuals"],
  ["WY", "A&H authority", "entity-and-individuals"]
].map(([state, licenseType, requiredParty]) => ({ state, licenseType, requiredParty }));
var appointmentRows = [
  ["AL", "X", "X", "X"],
  ["AK", "X*", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent*", ""],
  ["AZ", "", "", ""],
  ["AR", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["CA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["CO", "", "", ""],
  ["CT", "X", "X", "X"],
  ["DE", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["DC", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["FL", "X (individual only)", "X (individual only)", "X"],
  ["GA", "X (individual only)", "X (individual only)", "X"],
  ["HI", "X", "X", "X"],
  ["ID", "X", "X", ""],
  ["IL", "", "", ""],
  ["IN", "X*", "X*", "X*"],
  ["IA", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["KS", "X", "X", ""],
  ["KY", "X", "X", ""],
  ["LA", "X", "X", ""],
  ["ME", "X", "X", "X"],
  ["MD", "X*", "X*", "X*"],
  ["MA", "X", "X", ""],
  ["MI", "X", "X", "X"],
  ["MN", "X (individual only)", "X (individual only)", "X"],
  ["MS", "X (individual only)", "X (individual only)", "X"],
  ["MO", "X*", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent*", ""],
  ["MT", "X", "X", ""],
  ["NE", "X (individual only)", "X (individual only)", "X"],
  ["NV", "X", "X", ""],
  ["NH", "X", "X", "X"],
  ["NJ", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["NM", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["NY", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["NC", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["ND", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"],
  ["OH", "X", "X", "X"],
  ["OK", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"],
  ["OR", "X*", "X*", ""],
  ["PA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"],
  ["RI", "", "", ""],
  ["SC", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["SD", "X", "X", "X"],
  ["TN", "X (individual only)", "X (individual only)", "X"],
  ["TX", "X", "X", ""],
  ["UT", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["VT", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["VA", "X", "X", "X"],
  ["WA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["WV", "X (individual only)", "X (individual only)", "X"],
  ["WI", "X (individual only)", "X (individual only)", ""],
  ["WY", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"]
].map(([state, agencies, brokerages, individualEmployees]) => ({ state, agencies, brokerages, individualEmployees }));
var appointmentOverrides = {
  PA: { ruleType: "pre-appointment", filingWindowDays: null, fee: 15 },
  NY: { ruleType: "register-only", filingWindowDays: null, fee: 20 },
  FL: { ruleType: "jit", filingWindowDays: 15, fee: 250 },
  NJ: { ruleType: "pre-appointment", filingWindowDays: null, fee: 40 },
  IL: { ruleType: "jit", filingWindowDays: 30, fee: 50 },
  TX: { ruleType: "jit", filingWindowDays: 15, fee: 20 }
};
function appointmentType(row) {
  const values = `${row.agencies} ${row.brokerages} ${row.individualEmployees}`;
  if (!values.trim()) return "not-required";
  if (/case-by-case/i.test(values)) return "jit";
  return "pre-appointment";
}
var entityRules = stateRows.filter((row) => row.requiredParty === "entity-and-individuals").map((row) => ({
  id: `AH-ENTITY-${row.state}`,
  state: row.state,
  licenseType: row.licenseType,
  lineOfAuthority: "Accident & Health",
  requiredParty: "entity",
  sourceVersion: AH_RULES_VERSION,
  sourceFile: AH_RULES_SOURCE_FILE,
  sourceEffectiveDate: AH_RULES_SOURCE_DATE
}));
var individualRules = stateRows.map((row) => ({
  id: `AH-INDIVIDUAL-${row.state}`,
  state: row.state,
  licenseType: row.licenseType,
  lineOfAuthority: "Accident & Health",
  requiredParty: "individual",
  sourceVersion: AH_RULES_VERSION,
  sourceFile: AH_RULES_SOURCE_FILE,
  sourceEffectiveDate: AH_RULES_SOURCE_DATE
}));
var appointmentRules = appointmentRows.map((row) => {
  const override = appointmentOverrides[row.state];
  const ruleType = override?.ruleType ?? appointmentType(row);
  return {
    id: `AH-APPOINTMENT-${row.state}`,
    state: row.state,
    ruleType,
    requiredParty: /individual only/i.test(`${row.agencies} ${row.brokerages}`) ? "individual" : /case-by-case/i.test(`${row.agencies} ${row.brokerages}`) ? "case-by-case" : "entity-and-individuals",
    filingWindowDays: override?.filingWindowDays ?? null,
    fee: override?.fee ?? null,
    sourceVersion: AH_RULES_VERSION,
    sourceFile: AH_RULES_SOURCE_FILE,
    sourceEffectiveDate: AH_RULES_SOURCE_DATE,
    sourceNote: /\*/.test(`${row.agencies} ${row.brokerages} ${row.individualEmployees}`) ? "Appointment maintained by insurance company; no state filing required." : void 0
  };
});
var AH_LICENSING_RULES = {
  schemaVersion: 1,
  version: AH_RULES_VERSION,
  source: { file: AH_RULES_SOURCE_FILE, effectiveDate: AH_RULES_SOURCE_DATE, description: "A&H state licensing and producer appointment workbook" },
  entityRules,
  individualRules,
  appointmentRules
};
function hasAhAuthority(value, licenseType = "A&H authority") {
  const raw = Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  const normalized = raw.toLocaleLowerCase();
  if (!normalized) return false;
  const hasAh = /a\s*&\s*h|accident\s*(?:&|and)\s*health|health|disability|life\s*&\s*health/.test(normalized);
  if (!hasAh) return false;
  if (/disability/.test(licenseType.toLocaleLowerCase())) return /disability|a\s*&\s*h|health/.test(normalized);
  if (/health/.test(licenseType.toLocaleLowerCase())) return /health|a\s*&\s*h|accident/.test(normalized);
  return hasAh;
}
function stateRule(state) {
  const normalized = state.trim().toUpperCase();
  return {
    entity: entityRules.find((rule) => rule.state === normalized),
    individual: individualRules.find((rule) => rule.state === normalized),
    appointment: appointmentRules.find((rule) => rule.state === normalized)
  };
}
function evaluateAppointment(state, appointmentStatus, party = "individual") {
  const rule = appointmentRules.find((item) => item.state === state) ?? null;
  if (!rule) {
    return { rule, advisory: null, outcome: "RULE_UNAVAILABLE" };
  }
  if (rule.ruleType === "not-required" || rule.requiredParty === "entity" && party === "individual") {
    return { rule, advisory: null, outcome: "NO_APPOINTMENT_REQUIRED" };
  }
  if (/^(appointed|active)$/i.test(String(appointmentStatus ?? "").trim())) {
    return { rule, advisory: null, outcome: "APPOINTMENT_ACTIVE" };
  }
  const outcome = rule.ruleType === "pre-appointment" ? "REVIEW_PRE_APPOINTMENT" : rule.ruleType === "jit" ? "QUEUE_JIT_FILING" : "QUEUE_REGISTRATION";
  return {
    rule,
    outcome,
    advisory: {
      code: LICENSING_REASON_CODES.APPOINTMENT_ADVISORY,
      message: `${state} uses ${rule.ruleType}; confirm the producer appointment before binding.`,
      severity: "warning"
    }
  };
}

// test/licensing-rules.test.mjs
test("workbook catalog is versioned and has entity/individual rules", () => {
  assert.equal(AH_LICENSING_RULES.source.file, "A&H_State_Licensing_5-28-2026.xlsx");
  assert.equal(stateRule("PA").entity.requiredParty, "entity");
  assert.equal(stateRule("IA").entity, void 0);
  assert.equal(stateRule("IA").individual.requiredParty, "individual");
  assert.equal(stateRule("TX").individual.licenseType.includes("General Life"), true);
});
test("A&H authority accepts normalized LOA values and rejects unrelated lines", () => {
  assert.equal(hasAhAuthority(["Health", "P&C"]), true);
  assert.equal(hasAhAuthority("Property & Casualty", "A&H authority"), false);
  assert.equal(hasAhAuthority("Disability", "A&H (Disability) authority"), true);
});
test("appointment tiers are advisory and carry supplied metadata", () => {
  const pre = evaluateAppointment("PA", "Not Appointed");
  assert.equal(pre.rule.ruleType, "pre-appointment");
  assert.equal(pre.rule.fee, 15);
  assert.equal(pre.outcome, "REVIEW_PRE_APPOINTMENT");
  assert.equal(pre.advisory.code, LICENSING_REASON_CODES.APPOINTMENT_ADVISORY);
  assert.equal(evaluateAppointment("FL", "Not Appointed").outcome, "QUEUE_JIT_FILING");
  assert.equal(evaluateAppointment("NY", "Not Appointed").outcome, "QUEUE_REGISTRATION");
  assert.equal(evaluateAppointment("AZ", "Not Appointed").outcome, "NO_APPOINTMENT_REQUIRED");
  assert.equal(evaluateAppointment("ZZ", "Not Appointed").outcome, "RULE_UNAVAILABLE");
  assert.equal(evaluateAppointment("PA", "Appointed").outcome, "APPOINTMENT_ACTIVE");
  assert.equal(evaluateAppointment("PA", "Appointed").advisory, null);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibGljZW5zaW5nLXJ1bGVzLnRlc3QubWpzIiwgIi4uL3NyYy9saWIvbGljZW5zaW5nLXJ1bGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdGVzdCBmcm9tIFwibm9kZTp0ZXN0XCI7XG5pbXBvcnQgYXNzZXJ0IGZyb20gXCJub2RlOmFzc2VydC9zdHJpY3RcIjtcbmltcG9ydCB7XG4gIEFIX0xJQ0VOU0lOR19SVUxFUyxcbiAgTElDRU5TSU5HX1JFQVNPTl9DT0RFUyxcbiAgZXZhbHVhdGVBcHBvaW50bWVudCxcbiAgaGFzQWhBdXRob3JpdHksXG4gIHN0YXRlUnVsZSxcbn0gZnJvbSBcIi4uL3NyYy9saWIvbGljZW5zaW5nLXJ1bGVzLnRzXCI7XG5cbnRlc3QoXCJ3b3JrYm9vayBjYXRhbG9nIGlzIHZlcnNpb25lZCBhbmQgaGFzIGVudGl0eS9pbmRpdmlkdWFsIHJ1bGVzXCIsICgpID0+IHtcbiAgYXNzZXJ0LmVxdWFsKEFIX0xJQ0VOU0lOR19SVUxFUy5zb3VyY2UuZmlsZSwgXCJBJkhfU3RhdGVfTGljZW5zaW5nXzUtMjgtMjAyNi54bHN4XCIpO1xuICBhc3NlcnQuZXF1YWwoc3RhdGVSdWxlKFwiUEFcIikuZW50aXR5LnJlcXVpcmVkUGFydHksIFwiZW50aXR5XCIpO1xuICBhc3NlcnQuZXF1YWwoc3RhdGVSdWxlKFwiSUFcIikuZW50aXR5LCB1bmRlZmluZWQpO1xuICBhc3NlcnQuZXF1YWwoc3RhdGVSdWxlKFwiSUFcIikuaW5kaXZpZHVhbC5yZXF1aXJlZFBhcnR5LCBcImluZGl2aWR1YWxcIik7XG4gIGFzc2VydC5lcXVhbChzdGF0ZVJ1bGUoXCJUWFwiKS5pbmRpdmlkdWFsLmxpY2Vuc2VUeXBlLmluY2x1ZGVzKFwiR2VuZXJhbCBMaWZlXCIpLCB0cnVlKTtcbn0pO1xuXG50ZXN0KFwiQSZIIGF1dGhvcml0eSBhY2NlcHRzIG5vcm1hbGl6ZWQgTE9BIHZhbHVlcyBhbmQgcmVqZWN0cyB1bnJlbGF0ZWQgbGluZXNcIiwgKCkgPT4ge1xuICBhc3NlcnQuZXF1YWwoaGFzQWhBdXRob3JpdHkoW1wiSGVhbHRoXCIsIFwiUCZDXCJdKSwgdHJ1ZSk7XG4gIGFzc2VydC5lcXVhbChoYXNBaEF1dGhvcml0eShcIlByb3BlcnR5ICYgQ2FzdWFsdHlcIiwgXCJBJkggYXV0aG9yaXR5XCIpLCBmYWxzZSk7XG4gIGFzc2VydC5lcXVhbChoYXNBaEF1dGhvcml0eShcIkRpc2FiaWxpdHlcIiwgXCJBJkggKERpc2FiaWxpdHkpIGF1dGhvcml0eVwiKSwgdHJ1ZSk7XG59KTtcblxudGVzdChcImFwcG9pbnRtZW50IHRpZXJzIGFyZSBhZHZpc29yeSBhbmQgY2Fycnkgc3VwcGxpZWQgbWV0YWRhdGFcIiwgKCkgPT4ge1xuICBjb25zdCBwcmUgPSBldmFsdWF0ZUFwcG9pbnRtZW50KFwiUEFcIiwgXCJOb3QgQXBwb2ludGVkXCIpO1xuICBhc3NlcnQuZXF1YWwocHJlLnJ1bGUucnVsZVR5cGUsIFwicHJlLWFwcG9pbnRtZW50XCIpO1xuICBhc3NlcnQuZXF1YWwocHJlLnJ1bGUuZmVlLCAxNSk7XG4gIGFzc2VydC5lcXVhbChwcmUub3V0Y29tZSwgXCJSRVZJRVdfUFJFX0FQUE9JTlRNRU5UXCIpO1xuICBhc3NlcnQuZXF1YWwocHJlLmFkdmlzb3J5LmNvZGUsIExJQ0VOU0lOR19SRUFTT05fQ09ERVMuQVBQT0lOVE1FTlRfQURWSVNPUlkpO1xuICBhc3NlcnQuZXF1YWwoZXZhbHVhdGVBcHBvaW50bWVudChcIkZMXCIsIFwiTm90IEFwcG9pbnRlZFwiKS5vdXRjb21lLCBcIlFVRVVFX0pJVF9GSUxJTkdcIik7XG4gIGFzc2VydC5lcXVhbChldmFsdWF0ZUFwcG9pbnRtZW50KFwiTllcIiwgXCJOb3QgQXBwb2ludGVkXCIpLm91dGNvbWUsIFwiUVVFVUVfUkVHSVNUUkFUSU9OXCIpO1xuICBhc3NlcnQuZXF1YWwoZXZhbHVhdGVBcHBvaW50bWVudChcIkFaXCIsIFwiTm90IEFwcG9pbnRlZFwiKS5vdXRjb21lLCBcIk5PX0FQUE9JTlRNRU5UX1JFUVVJUkVEXCIpO1xuICBhc3NlcnQuZXF1YWwoZXZhbHVhdGVBcHBvaW50bWVudChcIlpaXCIsIFwiTm90IEFwcG9pbnRlZFwiKS5vdXRjb21lLCBcIlJVTEVfVU5BVkFJTEFCTEVcIik7XG4gIGFzc2VydC5lcXVhbChldmFsdWF0ZUFwcG9pbnRtZW50KFwiUEFcIiwgXCJBcHBvaW50ZWRcIikub3V0Y29tZSwgXCJBUFBPSU5UTUVOVF9BQ1RJVkVcIik7XG4gIGFzc2VydC5lcXVhbChldmFsdWF0ZUFwcG9pbnRtZW50KFwiUEFcIiwgXCJBcHBvaW50ZWRcIikuYWR2aXNvcnksIG51bGwpO1xufSk7IiwgImV4cG9ydCBjb25zdCBBSF9SVUxFU19WRVJTSU9OID0gXCJhaC1zdGF0ZS1saWNlbnNpbmctMjAyNi0wNS0yOFwiO1xuZXhwb3J0IGNvbnN0IEFIX1JVTEVTX1NPVVJDRV9GSUxFID0gXCJBJkhfU3RhdGVfTGljZW5zaW5nXzUtMjgtMjAyNi54bHN4XCI7XG5leHBvcnQgY29uc3QgQUhfUlVMRVNfU09VUkNFX0RBVEUgPSBcIjIwMjYtMDUtMjhcIjtcblxuZXhwb3J0IGNvbnN0IExJQ0VOU0lOR19SRUFTT05fQ09ERVMgPSB7XG4gIElOVkFMSURfRUZGRUNUSVZFX0RBVEU6IFwiSU5WQUxJRF9FRkZFQ1RJVkVfREFURVwiLFxuICBVTlNVUFBPUlRFRF9TVEFURTogXCJVTlNVUFBPUlRFRF9TVEFURVwiLFxuICBCUk9LRVJBR0VfTk9UX0ZPVU5EOiBcIkJST0tFUkFHRV9OT1RfRk9VTkRcIixcbiAgQlJPS0VSQUdFX0lOQUNUSVZFOiBcIkJST0tFUkFHRV9JTkFDVElWRVwiLFxuICBCUk9LRVJBR0VfSU5WQUxJRF9EQVRFUzogXCJCUk9LRVJBR0VfSU5WQUxJRF9EQVRFU1wiLFxuICBCUk9LRVJBR0VfTk9UX1lFVF9FRkZFQ1RJVkU6IFwiQlJPS0VSQUdFX05PVF9ZRVRfRUZGRUNUSVZFXCIsXG4gIEJST0tFUkFHRV9FWFBJUkVEOiBcIkJST0tFUkFHRV9FWFBJUkVEXCIsXG4gIEJST0tFUkFHRV9TVEFURV9VTkFVVEhPUklaRUQ6IFwiQlJPS0VSQUdFX1NUQVRFX1VOQVVUSE9SSVpFRFwiLFxuICBCUk9LRVJBR0VfQUhfQVVUSE9SSVRZX01JU1NJTkc6IFwiQlJPS0VSQUdFX0FIX0FVVEhPUklUWV9NSVNTSU5HXCIsXG4gIEJST0tFUkFHRV9DTEFTU0lGSUNBVElPTl9JTlZBTElEOiBcIkJST0tFUkFHRV9DTEFTU0lGSUNBVElPTl9JTlZBTElEXCIsXG4gIEFHRU5UX05PVF9GT1VORDogXCJBR0VOVF9OT1RfRk9VTkRcIixcbiAgQUdFTlRfSU5BQ1RJVkU6IFwiQUdFTlRfSU5BQ1RJVkVcIixcbiAgQUdFTlRfSU5WQUxJRF9EQVRFUzogXCJBR0VOVF9JTlZBTElEX0RBVEVTXCIsXG4gIEFHRU5UX05PVF9ZRVRfRUZGRUNUSVZFOiBcIkFHRU5UX05PVF9ZRVRfRUZGRUNUSVZFXCIsXG4gIEFHRU5UX0VYUElSRUQ6IFwiQUdFTlRfRVhQSVJFRFwiLFxuICBBR0VOVF9BSF9BVVRIT1JJVFlfTUlTU0lORzogXCJBR0VOVF9BSF9BVVRIT1JJVFlfTUlTU0lOR1wiLFxuICBBR0VOVF9DTEFTU0lGSUNBVElPTl9JTlZBTElEOiBcIkFHRU5UX0NMQVNTSUZJQ0FUSU9OX0lOVkFMSURcIixcbiAgQUdFTlRfTElDRU5TRV9NSVNTSU5HOiBcIkFHRU5UX0xJQ0VOU0VfTUlTU0lOR1wiLFxuICBBR0VOVF9MSUNFTlNFX0lOQUNUSVZFOiBcIkFHRU5UX0xJQ0VOU0VfSU5BQ1RJVkVcIixcbiAgQUdFTlRfTElDRU5TRV9JTlZBTElEX0RBVEVTOiBcIkFHRU5UX0xJQ0VOU0VfSU5WQUxJRF9EQVRFU1wiLFxuICBBR0VOVF9MSUNFTlNFX05PVF9ZRVRfRUZGRUNUSVZFOiBcIkFHRU5UX0xJQ0VOU0VfTk9UX1lFVF9FRkZFQ1RJVkVcIixcbiAgQUdFTlRfTElDRU5TRV9FWFBJUkVEOiBcIkFHRU5UX0xJQ0VOU0VfRVhQSVJFRFwiLFxuICBBUFBPSU5UTUVOVF9BRFZJU09SWTogXCJBUFBPSU5UTUVOVF9BRFZJU09SWVwiLFxufSBhcyBjb25zdDtcblxudHlwZSBQYXJ0eSA9IFwiZW50aXR5XCIgfCBcImluZGl2aWR1YWxcIjtcbnR5cGUgQXBwb2ludG1lbnRSdWxlVHlwZSA9IFwicHJlLWFwcG9pbnRtZW50XCIgfCBcImppdFwiIHwgXCJyZWdpc3Rlci1vbmx5XCIgfCBcIm5vdC1yZXF1aXJlZFwiO1xuXG50eXBlIFN0YXRlUm93ID0ge1xuICBzdGF0ZTogc3RyaW5nO1xuICBsaWNlbnNlVHlwZTogc3RyaW5nO1xuICByZXF1aXJlZFBhcnR5OiBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIiB8IFwiaW5kaXZpZHVhbHNcIjtcbn07XG5cbnR5cGUgQXBwb2ludG1lbnRSb3cgPSB7XG4gIHN0YXRlOiBzdHJpbmc7XG4gIGFnZW5jaWVzOiBzdHJpbmc7XG4gIGJyb2tlcmFnZXM6IHN0cmluZztcbiAgaW5kaXZpZHVhbEVtcGxveWVlczogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgQWhMaWNlbnNlUnVsZSA9IHtcbiAgaWQ6IHN0cmluZztcbiAgc3RhdGU6IHN0cmluZztcbiAgbGljZW5zZVR5cGU6IHN0cmluZztcbiAgbGluZU9mQXV0aG9yaXR5OiBzdHJpbmc7XG4gIHJlcXVpcmVkUGFydHk6IFBhcnR5O1xuICBzb3VyY2VWZXJzaW9uOiBzdHJpbmc7XG4gIHNvdXJjZUZpbGU6IHN0cmluZztcbiAgc291cmNlRWZmZWN0aXZlRGF0ZTogc3RyaW5nO1xufTtcblxuZXhwb3J0IHR5cGUgQXBwb2ludG1lbnRSdWxlID0ge1xuICBpZDogc3RyaW5nO1xuICBzdGF0ZTogc3RyaW5nO1xuICBydWxlVHlwZTogQXBwb2ludG1lbnRSdWxlVHlwZTtcbiAgcmVxdWlyZWRQYXJ0eTogUGFydHkgfCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIiB8IFwiY2FzZS1ieS1jYXNlXCI7XG4gIGZpbGluZ1dpbmRvd0RheXM6IG51bWJlciB8IG51bGw7XG4gIGZlZTogbnVtYmVyIHwgbnVsbDtcbiAgc291cmNlVmVyc2lvbjogc3RyaW5nO1xuICBzb3VyY2VGaWxlOiBzdHJpbmc7XG4gIHNvdXJjZUVmZmVjdGl2ZURhdGU6IHN0cmluZztcbiAgc291cmNlTm90ZT86IHN0cmluZztcbn07XG5cbmNvbnN0IHN0YXRlUm93czogU3RhdGVSb3dbXSA9IFtcbiAgW1wiQUxcIiwgXCJQJkMgb3IgQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIkFLXCIsIFwiQSZIIChIZWFsdGgpIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIkFaXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIkFSXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIkNBXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIkNPXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIkNUXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIkRFXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIkRDXCIsIFwiUCZDIG9yIEEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJGTFwiLCBcIlAmQyBvciBBJkggKEhlYWx0aCkgYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSxcbiAgW1wiR0FcIiwgXCJQJkMgb3IgQSZIIChBJlMpIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIkhJXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIklEXCIsIFwiQSZIIChEaXNhYmlsaXR5KSBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJJTFwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLFxuICBbXCJJTlwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJJQVwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJpbmRpdmlkdWFsc1wiXSxcbiAgW1wiS1NcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSwgW1wiS1lcIiwgXCJQJkMgb3IgQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIkxBXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk1FXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk1EXCIsIFwiQSZIIChIZWFsdGgpIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk1BXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk1JXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk1OXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk1TXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk1PXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk1UXCIsIFwiQSZIIChEaXNhYmlsaXR5KSBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJORVwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLFxuICBbXCJOVlwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJOSFwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLFxuICBbXCJOSlwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJOTVwiLCBcIlAmQyBvciBBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSxcbiAgW1wiTllcIiwgXCJQJkMgb3IgQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk5DXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk5EXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk9IXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIk9LXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIk9SXCIsIFwiQSZIIChIZWFsdGgpIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sXG4gIFtcIlBBXCIsIFwiQSZIIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIlJJXCIsIFwiUCZDIG9yIEEmSCBhdXRob3JpdHlcIiwgXCJpbmRpdmlkdWFsc1wiXSxcbiAgW1wiU0NcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSwgW1wiU0RcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSxcbiAgW1wiVE5cIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiaW5kaXZpZHVhbHNcIl0sIFtcIlRYXCIsIFwiUCZDIG9yIEdlbmVyYWwgTGlmZSwgQWNjaWRlbnQgJiBIZWFsdGggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSxcbiAgW1wiVVRcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSwgW1wiVlRcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiaW5kaXZpZHVhbHNcIl0sXG4gIFtcIlZBXCIsIFwiQSZIIChIZWFsdGgpIGF1dGhvcml0eVwiLCBcImVudGl0eS1hbmQtaW5kaXZpZHVhbHNcIl0sIFtcIldBXCIsIFwiQSZIIChEaXNhYmlsaXR5KSBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLFxuICBbXCJXVlwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCJdLCBbXCJXSVwiLCBcIkEmSCBhdXRob3JpdHlcIiwgXCJpbmRpdmlkdWFsc1wiXSxcbiAgW1wiV1lcIiwgXCJBJkggYXV0aG9yaXR5XCIsIFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiXSxcbl0ubWFwKChbc3RhdGUsIGxpY2Vuc2VUeXBlLCByZXF1aXJlZFBhcnR5XSkgPT4gKHsgc3RhdGUsIGxpY2Vuc2VUeXBlLCByZXF1aXJlZFBhcnR5OiByZXF1aXJlZFBhcnR5IGFzIFN0YXRlUm93W1wicmVxdWlyZWRQYXJ0eVwiXSB9KSk7XG5cbmNvbnN0IGFwcG9pbnRtZW50Um93czogQXBwb2ludG1lbnRSb3dbXSA9IFtcbiAgW1wiQUxcIiwgXCJYXCIsIFwiWFwiLCBcIlhcIl0sIFtcIkFLXCIsIFwiWCpcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnQqXCIsIFwiXCJdLFxuICBbXCJBWlwiLCBcIlwiLCBcIlwiLCBcIlwiXSwgW1wiQVJcIiwgXCJYXCIsIFwiUmVxdWlyZXMgY2FzZS1ieS1jYXNlIGFuYWx5c2lzIHRvIGRldGVybWluZSBpZiBqdXJpc2RpY3Rpb24gd2lsbCBkZWVtIGFuIEFnZW50XCIsIFwiXCJdLFxuICBbXCJDQVwiLCBcIlhcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnRcIiwgXCJcIl0sIFtcIkNPXCIsIFwiXCIsIFwiXCIsIFwiXCJdLFxuICBbXCJDVFwiLCBcIlhcIiwgXCJYXCIsIFwiWFwiXSwgW1wiREVcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiUmVxdWlyZXMgY2FzZS1ieS1jYXNlIGFuYWx5c2lzIHRvIGRldGVybWluZSBpZiBqdXJpc2RpY3Rpb24gd2lsbCBkZWVtIGFuIEFnZW50IChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWFwiXSxcbiAgW1wiRENcIiwgXCJYXCIsIFwiUmVxdWlyZXMgY2FzZS1ieS1jYXNlIGFuYWx5c2lzIHRvIGRldGVybWluZSBpZiBqdXJpc2RpY3Rpb24gd2lsbCBkZWVtIGFuIEFnZW50XCIsIFwiXCJdLCBbXCJGTFwiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWFwiXSxcbiAgW1wiR0FcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlhcIl0sIFtcIkhJXCIsIFwiWFwiLCBcIlhcIiwgXCJYXCJdLCBbXCJJRFwiLCBcIlhcIiwgXCJYXCIsIFwiXCJdLFxuICBbXCJJTFwiLCBcIlwiLCBcIlwiLCBcIlwiXSwgW1wiSU5cIiwgXCJYKlwiLCBcIlgqXCIsIFwiWCpcIl0sIFtcIklBXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlhcIl0sXG4gIFtcIktTXCIsIFwiWFwiLCBcIlhcIiwgXCJcIl0sIFtcIktZXCIsIFwiWFwiLCBcIlhcIiwgXCJcIl0sIFtcIkxBXCIsIFwiWFwiLCBcIlhcIiwgXCJcIl0sIFtcIk1FXCIsIFwiWFwiLCBcIlhcIiwgXCJYXCJdLFxuICBbXCJNRFwiLCBcIlgqXCIsIFwiWCpcIiwgXCJYKlwiXSwgW1wiTUFcIiwgXCJYXCIsIFwiWFwiLCBcIlwiXSwgW1wiTUlcIiwgXCJYXCIsIFwiWFwiLCBcIlhcIl0sIFtcIk1OXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJYXCJdLFxuICBbXCJNU1wiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWFwiXSwgW1wiTU9cIiwgXCJYKlwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudCpcIiwgXCJcIl0sXG4gIFtcIk1UXCIsIFwiWFwiLCBcIlhcIiwgXCJcIl0sIFtcIk5FXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJYXCJdLCBbXCJOVlwiLCBcIlhcIiwgXCJYXCIsIFwiXCJdLFxuICBbXCJOSFwiLCBcIlhcIiwgXCJYXCIsIFwiWFwiXSwgW1wiTkpcIiwgXCJYXCIsIFwiUmVxdWlyZXMgY2FzZS1ieS1jYXNlIGFuYWx5c2lzIHRvIGRldGVybWluZSBpZiBqdXJpc2RpY3Rpb24gd2lsbCBkZWVtIGFuIEFnZW50XCIsIFwiXCJdLFxuICBbXCJOTVwiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnQgKGluZGl2aWR1YWwgb25seSlcIiwgXCJYXCJdLFxuICBbXCJOWVwiLCBcIlhcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnRcIiwgXCJcIl0sIFtcIk5DXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlhcIl0sXG4gIFtcIk5EXCIsIFwiWFwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudFwiLCBcIlhcIl0sIFtcIk9IXCIsIFwiWFwiLCBcIlhcIiwgXCJYXCJdLFxuICBbXCJPS1wiLCBcIlhcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnRcIiwgXCJYXCJdLCBbXCJPUlwiLCBcIlgqXCIsIFwiWCpcIiwgXCJcIl0sXG4gIFtcIlBBXCIsIFwiWFwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudFwiLCBcIlhcIl0sIFtcIlJJXCIsIFwiXCIsIFwiXCIsIFwiXCJdLFxuICBbXCJTQ1wiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJSZXF1aXJlcyBjYXNlLWJ5LWNhc2UgYW5hbHlzaXMgdG8gZGV0ZXJtaW5lIGlmIGp1cmlzZGljdGlvbiB3aWxsIGRlZW0gYW4gQWdlbnQgKGluZGl2aWR1YWwgb25seSlcIiwgXCJYXCJdLFxuICBbXCJTRFwiLCBcIlhcIiwgXCJYXCIsIFwiWFwiXSwgW1wiVE5cIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlhcIl0sXG4gIFtcIlRYXCIsIFwiWFwiLCBcIlhcIiwgXCJcIl0sIFtcIlVUXCIsIFwiWFwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudFwiLCBcIlwiXSxcbiAgW1wiVlRcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiUmVxdWlyZXMgY2FzZS1ieS1jYXNlIGFuYWx5c2lzIHRvIGRldGVybWluZSBpZiBqdXJpc2RpY3Rpb24gd2lsbCBkZWVtIGFuIEFnZW50IChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWFwiXSxcbiAgW1wiVkFcIiwgXCJYXCIsIFwiWFwiLCBcIlhcIl0sIFtcIldBXCIsIFwiWFwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudFwiLCBcIlwiXSxcbiAgW1wiV1ZcIiwgXCJYIChpbmRpdmlkdWFsIG9ubHkpXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlhcIl0sIFtcIldJXCIsIFwiWCAoaW5kaXZpZHVhbCBvbmx5KVwiLCBcIlggKGluZGl2aWR1YWwgb25seSlcIiwgXCJcIl0sXG4gIFtcIldZXCIsIFwiWFwiLCBcIlJlcXVpcmVzIGNhc2UtYnktY2FzZSBhbmFseXNpcyB0byBkZXRlcm1pbmUgaWYganVyaXNkaWN0aW9uIHdpbGwgZGVlbSBhbiBBZ2VudFwiLCBcIlhcIl0sXG5dLm1hcCgoW3N0YXRlLCBhZ2VuY2llcywgYnJva2VyYWdlcywgaW5kaXZpZHVhbEVtcGxveWVlc10pID0+ICh7IHN0YXRlLCBhZ2VuY2llcywgYnJva2VyYWdlcywgaW5kaXZpZHVhbEVtcGxveWVlcyB9KSk7XG5cbmNvbnN0IGFwcG9pbnRtZW50T3ZlcnJpZGVzOiBSZWNvcmQ8c3RyaW5nLCB7IHJ1bGVUeXBlOiBBcHBvaW50bWVudFJ1bGVUeXBlOyBmaWxpbmdXaW5kb3dEYXlzOiBudW1iZXIgfCBudWxsOyBmZWU6IG51bWJlciB8IG51bGwgfT4gPSB7XG4gIFBBOiB7IHJ1bGVUeXBlOiBcInByZS1hcHBvaW50bWVudFwiLCBmaWxpbmdXaW5kb3dEYXlzOiBudWxsLCBmZWU6IDE1IH0sXG4gIE5ZOiB7IHJ1bGVUeXBlOiBcInJlZ2lzdGVyLW9ubHlcIiwgZmlsaW5nV2luZG93RGF5czogbnVsbCwgZmVlOiAyMCB9LFxuICBGTDogeyBydWxlVHlwZTogXCJqaXRcIiwgZmlsaW5nV2luZG93RGF5czogMTUsIGZlZTogMjUwIH0sXG4gIE5KOiB7IHJ1bGVUeXBlOiBcInByZS1hcHBvaW50bWVudFwiLCBmaWxpbmdXaW5kb3dEYXlzOiBudWxsLCBmZWU6IDQwIH0sXG4gIElMOiB7IHJ1bGVUeXBlOiBcImppdFwiLCBmaWxpbmdXaW5kb3dEYXlzOiAzMCwgZmVlOiA1MCB9LFxuICBUWDogeyBydWxlVHlwZTogXCJqaXRcIiwgZmlsaW5nV2luZG93RGF5czogMTUsIGZlZTogMjAgfSxcbn07XG5cbmZ1bmN0aW9uIGFwcG9pbnRtZW50VHlwZShyb3c6IEFwcG9pbnRtZW50Um93KTogQXBwb2ludG1lbnRSdWxlVHlwZSB7XG4gIGNvbnN0IHZhbHVlcyA9IGAke3Jvdy5hZ2VuY2llc30gJHtyb3cuYnJva2VyYWdlc30gJHtyb3cuaW5kaXZpZHVhbEVtcGxveWVlc31gO1xuICBpZiAoIXZhbHVlcy50cmltKCkpIHJldHVybiBcIm5vdC1yZXF1aXJlZFwiO1xuICBpZiAoL2Nhc2UtYnktY2FzZS9pLnRlc3QodmFsdWVzKSkgcmV0dXJuIFwiaml0XCI7XG4gIHJldHVybiBcInByZS1hcHBvaW50bWVudFwiO1xufVxuXG5jb25zdCBlbnRpdHlSdWxlczogQWhMaWNlbnNlUnVsZVtdID0gc3RhdGVSb3dzXG4gIC5maWx0ZXIoKHJvdykgPT4gcm93LnJlcXVpcmVkUGFydHkgPT09IFwiZW50aXR5LWFuZC1pbmRpdmlkdWFsc1wiKVxuICAubWFwKChyb3cpID0+ICh7XG4gICAgaWQ6IGBBSC1FTlRJVFktJHtyb3cuc3RhdGV9YCxcbiAgICBzdGF0ZTogcm93LnN0YXRlLFxuICAgIGxpY2Vuc2VUeXBlOiByb3cubGljZW5zZVR5cGUsXG4gICAgbGluZU9mQXV0aG9yaXR5OiBcIkFjY2lkZW50ICYgSGVhbHRoXCIsXG4gICAgcmVxdWlyZWRQYXJ0eTogXCJlbnRpdHlcIixcbiAgICBzb3VyY2VWZXJzaW9uOiBBSF9SVUxFU19WRVJTSU9OLFxuICAgIHNvdXJjZUZpbGU6IEFIX1JVTEVTX1NPVVJDRV9GSUxFLFxuICAgIHNvdXJjZUVmZmVjdGl2ZURhdGU6IEFIX1JVTEVTX1NPVVJDRV9EQVRFLFxuICB9KSk7XG5cbmNvbnN0IGluZGl2aWR1YWxSdWxlczogQWhMaWNlbnNlUnVsZVtdID0gc3RhdGVSb3dzLm1hcCgocm93KSA9PiAoe1xuICBpZDogYEFILUlORElWSURVQUwtJHtyb3cuc3RhdGV9YCxcbiAgc3RhdGU6IHJvdy5zdGF0ZSxcbiAgbGljZW5zZVR5cGU6IHJvdy5saWNlbnNlVHlwZSxcbiAgbGluZU9mQXV0aG9yaXR5OiBcIkFjY2lkZW50ICYgSGVhbHRoXCIsXG4gIHJlcXVpcmVkUGFydHk6IFwiaW5kaXZpZHVhbFwiLFxuICBzb3VyY2VWZXJzaW9uOiBBSF9SVUxFU19WRVJTSU9OLFxuICBzb3VyY2VGaWxlOiBBSF9SVUxFU19TT1VSQ0VfRklMRSxcbiAgc291cmNlRWZmZWN0aXZlRGF0ZTogQUhfUlVMRVNfU09VUkNFX0RBVEUsXG59KSk7XG5cbmNvbnN0IGFwcG9pbnRtZW50UnVsZXM6IEFwcG9pbnRtZW50UnVsZVtdID0gYXBwb2ludG1lbnRSb3dzLm1hcCgocm93KSA9PiB7XG4gIGNvbnN0IG92ZXJyaWRlID0gYXBwb2ludG1lbnRPdmVycmlkZXNbcm93LnN0YXRlXTtcbiAgY29uc3QgcnVsZVR5cGUgPSBvdmVycmlkZT8ucnVsZVR5cGUgPz8gYXBwb2ludG1lbnRUeXBlKHJvdyk7XG4gIHJldHVybiB7XG4gICAgaWQ6IGBBSC1BUFBPSU5UTUVOVC0ke3Jvdy5zdGF0ZX1gLFxuICAgIHN0YXRlOiByb3cuc3RhdGUsXG4gICAgcnVsZVR5cGUsXG4gICAgcmVxdWlyZWRQYXJ0eTogL2luZGl2aWR1YWwgb25seS9pLnRlc3QoYCR7cm93LmFnZW5jaWVzfSAke3Jvdy5icm9rZXJhZ2VzfWApID8gXCJpbmRpdmlkdWFsXCIgOiAvY2FzZS1ieS1jYXNlL2kudGVzdChgJHtyb3cuYWdlbmNpZXN9ICR7cm93LmJyb2tlcmFnZXN9YCkgPyBcImNhc2UtYnktY2FzZVwiIDogXCJlbnRpdHktYW5kLWluZGl2aWR1YWxzXCIsXG4gICAgZmlsaW5nV2luZG93RGF5czogb3ZlcnJpZGU/LmZpbGluZ1dpbmRvd0RheXMgPz8gbnVsbCxcbiAgICBmZWU6IG92ZXJyaWRlPy5mZWUgPz8gbnVsbCxcbiAgICBzb3VyY2VWZXJzaW9uOiBBSF9SVUxFU19WRVJTSU9OLFxuICAgIHNvdXJjZUZpbGU6IEFIX1JVTEVTX1NPVVJDRV9GSUxFLFxuICAgIHNvdXJjZUVmZmVjdGl2ZURhdGU6IEFIX1JVTEVTX1NPVVJDRV9EQVRFLFxuICAgIHNvdXJjZU5vdGU6IC9cXCovLnRlc3QoYCR7cm93LmFnZW5jaWVzfSAke3Jvdy5icm9rZXJhZ2VzfSAke3Jvdy5pbmRpdmlkdWFsRW1wbG95ZWVzfWApID8gXCJBcHBvaW50bWVudCBtYWludGFpbmVkIGJ5IGluc3VyYW5jZSBjb21wYW55OyBubyBzdGF0ZSBmaWxpbmcgcmVxdWlyZWQuXCIgOiB1bmRlZmluZWQsXG4gIH07XG59KTtcblxuZXhwb3J0IGNvbnN0IEFIX0xJQ0VOU0lOR19SVUxFUyA9IHtcbiAgc2NoZW1hVmVyc2lvbjogMSxcbiAgdmVyc2lvbjogQUhfUlVMRVNfVkVSU0lPTixcbiAgc291cmNlOiB7IGZpbGU6IEFIX1JVTEVTX1NPVVJDRV9GSUxFLCBlZmZlY3RpdmVEYXRlOiBBSF9SVUxFU19TT1VSQ0VfREFURSwgZGVzY3JpcHRpb246IFwiQSZIIHN0YXRlIGxpY2Vuc2luZyBhbmQgcHJvZHVjZXIgYXBwb2ludG1lbnQgd29ya2Jvb2tcIiB9LFxuICBlbnRpdHlSdWxlcyxcbiAgaW5kaXZpZHVhbFJ1bGVzLFxuICBhcHBvaW50bWVudFJ1bGVzLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUF1dGhvcml0eSh2YWx1ZTogdW5rbm93bik6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSA/PyBcIlwiKVxuICAgIC5zcGxpdCgvWyw7fC9dKy8pXG4gICAgLm1hcCgocGFydCkgPT4gcGFydC50cmltKCkudG9Mb2NhbGVMb3dlckNhc2UoKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzQWhBdXRob3JpdHkodmFsdWU6IHVua25vd24sIGxpY2Vuc2VUeXBlID0gXCJBJkggYXV0aG9yaXR5XCIpOiBib29sZWFuIHtcbiAgY29uc3QgcmF3ID0gQXJyYXkuaXNBcnJheSh2YWx1ZSlcbiAgICA/IHZhbHVlLm1hcCgoaXRlbSkgPT4gdHlwZW9mIGl0ZW0gPT09IFwib2JqZWN0XCIgPyBKU09OLnN0cmluZ2lmeShpdGVtKSA6IFN0cmluZyhpdGVtKSkuam9pbihcIiBcIilcbiAgICA6IHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKSA6IFN0cmluZyh2YWx1ZSA/PyBcIlwiKTtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IHJhdy50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuICBpZiAoIW5vcm1hbGl6ZWQpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgaGFzQWggPSAvYVxccyomXFxzKmh8YWNjaWRlbnRcXHMqKD86JnxhbmQpXFxzKmhlYWx0aHxoZWFsdGh8ZGlzYWJpbGl0eXxsaWZlXFxzKiZcXHMqaGVhbHRoLy50ZXN0KG5vcm1hbGl6ZWQpO1xuICBpZiAoIWhhc0FoKSByZXR1cm4gZmFsc2U7XG4gIGlmICgvZGlzYWJpbGl0eS8udGVzdChsaWNlbnNlVHlwZS50b0xvY2FsZUxvd2VyQ2FzZSgpKSkgcmV0dXJuIC9kaXNhYmlsaXR5fGFcXHMqJlxccypofGhlYWx0aC8udGVzdChub3JtYWxpemVkKTtcbiAgaWYgKC9oZWFsdGgvLnRlc3QobGljZW5zZVR5cGUudG9Mb2NhbGVMb3dlckNhc2UoKSkpIHJldHVybiAvaGVhbHRofGFcXHMqJlxccypofGFjY2lkZW50Ly50ZXN0KG5vcm1hbGl6ZWQpO1xuICByZXR1cm4gaGFzQWg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZVJ1bGUoc3RhdGU6IHN0cmluZykge1xuICBjb25zdCBub3JtYWxpemVkID0gc3RhdGUudHJpbSgpLnRvVXBwZXJDYXNlKCk7XG4gIHJldHVybiB7XG4gICAgZW50aXR5OiBlbnRpdHlSdWxlcy5maW5kKChydWxlKSA9PiBydWxlLnN0YXRlID09PSBub3JtYWxpemVkKSxcbiAgICBpbmRpdmlkdWFsOiBpbmRpdmlkdWFsUnVsZXMuZmluZCgocnVsZSkgPT4gcnVsZS5zdGF0ZSA9PT0gbm9ybWFsaXplZCksXG4gICAgYXBwb2ludG1lbnQ6IGFwcG9pbnRtZW50UnVsZXMuZmluZCgocnVsZSkgPT4gcnVsZS5zdGF0ZSA9PT0gbm9ybWFsaXplZCksXG4gIH07XG59XG5cbmV4cG9ydCB0eXBlIExpY2Vuc2luZ1ZhbGlkYXRpb24gPSB7XG4gIHZhbGlkOiBib29sZWFuO1xuICBoYXJkQmxvY2s6IGJvb2xlYW47XG4gIHJlYXNvbkNvZGU/OiBzdHJpbmc7XG4gIHJlYXNvbj86IHN0cmluZztcbiAgcmVhc29uczogQXJyYXk8eyBjb2RlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZzsgc2V2ZXJpdHk6IFwiZXJyb3JcIiB8IFwid2FybmluZ1wiIH0+O1xuICBhZHZpc29yeTogQXJyYXk8eyBjb2RlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZzsgc2V2ZXJpdHk6IFwid2FybmluZ1wiIH0+O1xuICBhcHBvaW50bWVudDogQXBwb2ludG1lbnRSdWxlIHwgbnVsbDtcbiAgZXZpZGVuY2U6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGV2YWx1YXRlQXBwb2ludG1lbnQoc3RhdGU6IHN0cmluZywgYXBwb2ludG1lbnRTdGF0dXM6IHVua25vd24sIHBhcnR5OiBQYXJ0eSA9IFwiaW5kaXZpZHVhbFwiKSB7XG4gIGNvbnN0IHJ1bGUgPSBhcHBvaW50bWVudFJ1bGVzLmZpbmQoKGl0ZW0pID0+IGl0ZW0uc3RhdGUgPT09IHN0YXRlKSA/PyBudWxsO1xuICBpZiAoIXJ1bGUpIHtcbiAgICByZXR1cm4geyBydWxlLCBhZHZpc29yeTogbnVsbCwgb3V0Y29tZTogXCJSVUxFX1VOQVZBSUxBQkxFXCIgYXMgY29uc3QgfTtcbiAgfVxuICBpZiAocnVsZS5ydWxlVHlwZSA9PT0gXCJub3QtcmVxdWlyZWRcIiB8fCAocnVsZS5yZXF1aXJlZFBhcnR5ID09PSBcImVudGl0eVwiICYmIHBhcnR5ID09PSBcImluZGl2aWR1YWxcIikpIHtcbiAgICByZXR1cm4geyBydWxlLCBhZHZpc29yeTogbnVsbCwgb3V0Y29tZTogXCJOT19BUFBPSU5UTUVOVF9SRVFVSVJFRFwiIGFzIGNvbnN0IH07XG4gIH1cbiAgaWYgKC9eKGFwcG9pbnRlZHxhY3RpdmUpJC9pLnRlc3QoU3RyaW5nKGFwcG9pbnRtZW50U3RhdHVzID8/IFwiXCIpLnRyaW0oKSkpIHtcbiAgICByZXR1cm4geyBydWxlLCBhZHZpc29yeTogbnVsbCwgb3V0Y29tZTogXCJBUFBPSU5UTUVOVF9BQ1RJVkVcIiBhcyBjb25zdCB9O1xuICB9XG4gIGNvbnN0IG91dGNvbWUgPSBydWxlLnJ1bGVUeXBlID09PSBcInByZS1hcHBvaW50bWVudFwiXG4gICAgPyBcIlJFVklFV19QUkVfQVBQT0lOVE1FTlRcIlxuICAgIDogcnVsZS5ydWxlVHlwZSA9PT0gXCJqaXRcIlxuICAgICAgPyBcIlFVRVVFX0pJVF9GSUxJTkdcIlxuICAgICAgOiBcIlFVRVVFX1JFR0lTVFJBVElPTlwiO1xuICByZXR1cm4ge1xuICAgIHJ1bGUsXG4gICAgb3V0Y29tZSxcbiAgICBhZHZpc29yeToge1xuICAgICAgY29kZTogTElDRU5TSU5HX1JFQVNPTl9DT0RFUy5BUFBPSU5UTUVOVF9BRFZJU09SWSxcbiAgICAgIG1lc3NhZ2U6IGAke3N0YXRlfSB1c2VzICR7cnVsZS5ydWxlVHlwZX07IGNvbmZpcm0gdGhlIHByb2R1Y2VyIGFwcG9pbnRtZW50IGJlZm9yZSBiaW5kaW5nLmAsXG4gICAgICBzZXZlcml0eTogXCJ3YXJuaW5nXCIgYXMgY29uc3QsXG4gICAgfSxcbiAgfTtcbn0iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sWUFBWTs7O0FDRFosSUFBTSxtQkFBbUI7QUFDekIsSUFBTSx1QkFBdUI7QUFDN0IsSUFBTSx1QkFBdUI7QUFFN0IsSUFBTSx5QkFBeUI7QUFBQSxFQUNwQyx3QkFBd0I7QUFBQSxFQUN4QixtQkFBbUI7QUFBQSxFQUNuQixxQkFBcUI7QUFBQSxFQUNyQixvQkFBb0I7QUFBQSxFQUNwQix5QkFBeUI7QUFBQSxFQUN6Qiw2QkFBNkI7QUFBQSxFQUM3QixtQkFBbUI7QUFBQSxFQUNuQiw4QkFBOEI7QUFBQSxFQUM5QixnQ0FBZ0M7QUFBQSxFQUNoQyxrQ0FBa0M7QUFBQSxFQUNsQyxpQkFBaUI7QUFBQSxFQUNqQixnQkFBZ0I7QUFBQSxFQUNoQixxQkFBcUI7QUFBQSxFQUNyQix5QkFBeUI7QUFBQSxFQUN6QixlQUFlO0FBQUEsRUFDZiw0QkFBNEI7QUFBQSxFQUM1Qiw4QkFBOEI7QUFBQSxFQUM5Qix1QkFBdUI7QUFBQSxFQUN2Qix3QkFBd0I7QUFBQSxFQUN4Qiw2QkFBNkI7QUFBQSxFQUM3QixpQ0FBaUM7QUFBQSxFQUNqQyx1QkFBdUI7QUFBQSxFQUN2QixzQkFBc0I7QUFDeEI7QUEwQ0EsSUFBTSxZQUF3QjtBQUFBLEVBQzVCLENBQUMsTUFBTSx3QkFBd0Isd0JBQXdCO0FBQUEsRUFBRyxDQUFDLE1BQU0sMEJBQTBCLHdCQUF3QjtBQUFBLEVBQ25ILENBQUMsTUFBTSxpQkFBaUIsd0JBQXdCO0FBQUEs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
