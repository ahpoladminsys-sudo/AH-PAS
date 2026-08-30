export const AH_RULES_VERSION = "ah-state-licensing-2026-05-28";
export const AH_RULES_SOURCE_FILE = "A&H_State_Licensing_5-28-2026.xlsx";
export const AH_RULES_SOURCE_DATE = "2026-05-28";

export const LICENSING_REASON_CODES = {
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
  APPOINTMENT_ADVISORY: "APPOINTMENT_ADVISORY",
} as const;

type Party = "entity" | "individual";
type AppointmentRuleType = "pre-appointment" | "jit" | "register-only" | "not-required";

type StateRow = {
  state: string;
  licenseType: string;
  requiredParty: "entity-and-individuals" | "individuals";
};

type AppointmentRow = {
  state: string;
  agencies: string;
  brokerages: string;
  individualEmployees: string;
};

export type AhLicenseRule = {
  id: string;
  state: string;
  licenseType: string;
  lineOfAuthority: string;
  requiredParty: Party;
  sourceVersion: string;
  sourceFile: string;
  sourceEffectiveDate: string;
};

export type AppointmentRule = {
  id: string;
  state: string;
  ruleType: AppointmentRuleType;
  requiredParty: Party | "entity-and-individuals" | "case-by-case";
  filingWindowDays: number | null;
  fee: number | null;
  sourceVersion: string;
  sourceFile: string;
  sourceEffectiveDate: string;
  sourceNote?: string;
};

const stateRows: StateRow[] = [
  ["AL", "P&C or A&H authority", "entity-and-individuals"], ["AK", "A&H (Health) authority", "entity-and-individuals"],
  ["AZ", "A&H authority", "entity-and-individuals"], ["AR", "A&H authority", "entity-and-individuals"],
  ["CA", "A&H authority", "entity-and-individuals"], ["CO", "A&H authority", "entity-and-individuals"],
  ["CT", "A&H authority", "entity-and-individuals"], ["DE", "A&H authority", "entity-and-individuals"],
  ["DC", "P&C or A&H authority", "entity-and-individuals"], ["FL", "P&C or A&H (Health) authority", "entity-and-individuals"],
  ["GA", "P&C or A&H (A&S) authority", "entity-and-individuals"], ["HI", "A&H authority", "entity-and-individuals"],
  ["ID", "A&H (Disability) authority", "entity-and-individuals"], ["IL", "A&H authority", "entity-and-individuals"],
  ["IN", "A&H authority", "entity-and-individuals"], ["IA", "A&H authority", "individuals"],
  ["KS", "A&H authority", "entity-and-individuals"], ["KY", "P&C or A&H authority", "entity-and-individuals"],
  ["LA", "A&H authority", "entity-and-individuals"], ["ME", "A&H authority", "entity-and-individuals"],
  ["MD", "A&H (Health) authority", "entity-and-individuals"], ["MA", "A&H authority", "entity-and-individuals"],
  ["MI", "A&H authority", "entity-and-individuals"], ["MN", "A&H authority", "entity-and-individuals"],
  ["MS", "A&H authority", "entity-and-individuals"], ["MO", "A&H authority", "entity-and-individuals"],
  ["MT", "A&H (Disability) authority", "entity-and-individuals"], ["NE", "A&H authority", "entity-and-individuals"],
  ["NV", "A&H authority", "entity-and-individuals"], ["NH", "A&H authority", "entity-and-individuals"],
  ["NJ", "A&H authority", "entity-and-individuals"], ["NM", "P&C or A&H authority", "entity-and-individuals"],
  ["NY", "P&C or A&H authority", "entity-and-individuals"], ["NC", "A&H authority", "entity-and-individuals"],
  ["ND", "A&H authority", "entity-and-individuals"], ["OH", "A&H authority", "entity-and-individuals"],
  ["OK", "A&H authority", "entity-and-individuals"], ["OR", "A&H (Health) authority", "entity-and-individuals"],
  ["PA", "A&H authority", "entity-and-individuals"], ["RI", "P&C or A&H authority", "individuals"],
  ["SC", "A&H authority", "entity-and-individuals"], ["SD", "A&H authority", "entity-and-individuals"],
  ["TN", "A&H authority", "individuals"], ["TX", "P&C or General Life, Accident & Health authority", "entity-and-individuals"],
  ["UT", "A&H authority", "entity-and-individuals"], ["VT", "A&H authority", "individuals"],
  ["VA", "A&H (Health) authority", "entity-and-individuals"], ["WA", "A&H (Disability) authority", "entity-and-individuals"],
  ["WV", "A&H authority", "entity-and-individuals"], ["WI", "A&H authority", "individuals"],
  ["WY", "A&H authority", "entity-and-individuals"],
].map(([state, licenseType, requiredParty]) => ({ state, licenseType, requiredParty: requiredParty as StateRow["requiredParty"] }));

const appointmentRows: AppointmentRow[] = [
  ["AL", "X", "X", "X"], ["AK", "X*", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent*", ""],
  ["AZ", "", "", ""], ["AR", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["CA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""], ["CO", "", "", ""],
  ["CT", "X", "X", "X"], ["DE", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["DC", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""], ["FL", "X (individual only)", "X (individual only)", "X"],
  ["GA", "X (individual only)", "X (individual only)", "X"], ["HI", "X", "X", "X"], ["ID", "X", "X", ""],
  ["IL", "", "", ""], ["IN", "X*", "X*", "X*"], ["IA", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["KS", "X", "X", ""], ["KY", "X", "X", ""], ["LA", "X", "X", ""], ["ME", "X", "X", "X"],
  ["MD", "X*", "X*", "X*"], ["MA", "X", "X", ""], ["MI", "X", "X", "X"], ["MN", "X (individual only)", "X (individual only)", "X"],
  ["MS", "X (individual only)", "X (individual only)", "X"], ["MO", "X*", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent*", ""],
  ["MT", "X", "X", ""], ["NE", "X (individual only)", "X (individual only)", "X"], ["NV", "X", "X", ""],
  ["NH", "X", "X", "X"], ["NJ", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["NM", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["NY", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""], ["NC", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["ND", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"], ["OH", "X", "X", "X"],
  ["OK", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"], ["OR", "X*", "X*", ""],
  ["PA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"], ["RI", "", "", ""],
  ["SC", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["SD", "X", "X", "X"], ["TN", "X (individual only)", "X (individual only)", "X"],
  ["TX", "X", "X", ""], ["UT", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["VT", "X (individual only)", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent (individual only)", "X"],
  ["VA", "X", "X", "X"], ["WA", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", ""],
  ["WV", "X (individual only)", "X (individual only)", "X"], ["WI", "X (individual only)", "X (individual only)", ""],
  ["WY", "X", "Requires case-by-case analysis to determine if jurisdiction will deem an Agent", "X"],
].map(([state, agencies, brokerages, individualEmployees]) => ({ state, agencies, brokerages, individualEmployees }));

const appointmentOverrides: Record<string, { ruleType: AppointmentRuleType; filingWindowDays: number | null; fee: number | null }> = {
  PA: { ruleType: "pre-appointment", filingWindowDays: null, fee: 15 },
  NY: { ruleType: "register-only", filingWindowDays: null, fee: 20 },
  FL: { ruleType: "jit", filingWindowDays: 15, fee: 250 },
  NJ: { ruleType: "pre-appointment", filingWindowDays: null, fee: 40 },
  IL: { ruleType: "jit", filingWindowDays: 30, fee: 50 },
  TX: { ruleType: "jit", filingWindowDays: 15, fee: 20 },
};

function appointmentType(row: AppointmentRow): AppointmentRuleType {
  const values = `${row.agencies} ${row.brokerages} ${row.individualEmployees}`;
  if (!values.trim()) return "not-required";
  if (/case-by-case/i.test(values)) return "jit";
  return "pre-appointment";
}

const entityRules: AhLicenseRule[] = stateRows
  .filter((row) => row.requiredParty === "entity-and-individuals")
  .map((row) => ({
    id: `AH-ENTITY-${row.state}`,
    state: row.state,
    licenseType: row.licenseType,
    lineOfAuthority: "Accident & Health",
    requiredParty: "entity",
    sourceVersion: AH_RULES_VERSION,
    sourceFile: AH_RULES_SOURCE_FILE,
    sourceEffectiveDate: AH_RULES_SOURCE_DATE,
  }));

const individualRules: AhLicenseRule[] = stateRows.map((row) => ({
  id: `AH-INDIVIDUAL-${row.state}`,
  state: row.state,
  licenseType: row.licenseType,
  lineOfAuthority: "Accident & Health",
  requiredParty: "individual",
  sourceVersion: AH_RULES_VERSION,
  sourceFile: AH_RULES_SOURCE_FILE,
  sourceEffectiveDate: AH_RULES_SOURCE_DATE,
}));

const appointmentRules: AppointmentRule[] = appointmentRows.map((row) => {
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
    sourceNote: /\*/.test(`${row.agencies} ${row.brokerages} ${row.individualEmployees}`) ? "Appointment maintained by insurance company; no state filing required." : undefined,
  };
});

export const AH_LICENSING_RULES = {
  schemaVersion: 1,
  version: AH_RULES_VERSION,
  source: { file: AH_RULES_SOURCE_FILE, effectiveDate: AH_RULES_SOURCE_DATE, description: "A&H state licensing and producer appointment workbook" },
  entityRules,
  individualRules,
  appointmentRules,
};

export function normalizeAuthority(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,;|/]+/)
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean);
}

export function hasAhAuthority(value: unknown, licenseType = "A&H authority"): boolean {
  const raw = Array.isArray(value)
    ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" ")
    : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  const normalized = raw.toLocaleLowerCase();
  if (!normalized) return false;
  const hasAh = /a\s*&\s*h|accident\s*(?:&|and)\s*health|health|disability|life\s*&\s*health/.test(normalized);
  if (!hasAh) return false;
  if (/disability/.test(licenseType.toLocaleLowerCase())) return /disability|a\s*&\s*h|health/.test(normalized);
  if (/health/.test(licenseType.toLocaleLowerCase())) return /health|a\s*&\s*h|accident/.test(normalized);
  return hasAh;
}

export function stateRule(state: string) {
  const normalized = state.trim().toUpperCase();
  return {
    entity: entityRules.find((rule) => rule.state === normalized),
    individual: individualRules.find((rule) => rule.state === normalized),
    appointment: appointmentRules.find((rule) => rule.state === normalized),
  };
}

export type LicensingValidation = {
  valid: boolean;
  hardBlock: boolean;
  reasonCode?: string;
  reason?: string;
  reasons: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  advisory: Array<{ code: string; message: string; severity: "warning" }>;
  appointment: AppointmentRule | null;
  evidence: Record<string, unknown>;
};

export function evaluateAppointment(state: string, appointmentStatus: unknown, party: Party = "individual") {
  const rule = appointmentRules.find((item) => item.state === state) ?? null;
  if (!rule) {
    return { rule, advisory: null, outcome: "RULE_UNAVAILABLE" as const };
  }
  if (rule.ruleType === "not-required" || (rule.requiredParty === "entity" && party === "individual")) {
    return { rule, advisory: null, outcome: "NO_APPOINTMENT_REQUIRED" as const };
  }
  if (/^(appointed|active)$/i.test(String(appointmentStatus ?? "").trim())) {
    return { rule, advisory: null, outcome: "APPOINTMENT_ACTIVE" as const };
  }
  const outcome = rule.ruleType === "pre-appointment"
    ? "REVIEW_PRE_APPOINTMENT"
    : rule.ruleType === "jit"
      ? "QUEUE_JIT_FILING"
      : "QUEUE_REGISTRATION";
  return {
    rule,
    outcome,
    advisory: {
      code: LICENSING_REASON_CODES.APPOINTMENT_ADVISORY,
      message: `${state} uses ${rule.ruleType}; confirm the producer appointment before binding.`,
      severity: "warning" as const,
    },
  };
}