import test from "node:test";
import assert from "node:assert/strict";
import {
  AH_LICENSING_RULES,
  LICENSING_REASON_CODES,
  evaluateAppointment,
  hasAhAuthority,
  stateRule,
} from "../src/lib/licensing-rules.ts";

test("workbook catalog is versioned and has entity/individual rules", () => {
  assert.equal(AH_LICENSING_RULES.source.file, "A&H_State_Licensing_5-28-2026.xlsx");
  assert.equal(stateRule("PA").entity.requiredParty, "entity");
  assert.equal(stateRule("IA").entity, undefined);
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