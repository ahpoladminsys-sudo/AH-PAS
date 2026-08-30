import { existsSync, readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { db, licensingStateTable } from "@workspace/db";
import {
  AH_LICENSING_RULES,
  LICENSING_REASON_CODES,
  evaluateAppointment,
  hasAhAuthority,
  stateRule,
} from "../lib/licensing-rules";
import { deriveLicensingAudits, mergeServerAudits } from "../lib/licensing-audit";
import {
  createRegulatoryGatewayAdapter,
  REGULATORY_TRANSPORT_CONTRACTS,
  type RegulatoryTransportHealth,
} from "../lib/regulatory-transport";

const router: IRouter = Router();
export const regulatoryCallbackRouter: IRouter = Router();

type License = { state?: string; status?: string; effDate?: string; expDate?: string; effectiveDate?: string; expirationDate?: string; agentId?: unknown };
type Brokerage = { name?: string; status?: string; states?: string[]; effDate?: string; expDate?: string; effectiveDate?: string; expirationDate?: string; lineOfAuthority?: unknown; ahAuthority?: unknown; entityClassification?: string };
type Agent = { name?: string; brokerage?: string; status?: string; effDate?: string; expDate?: string; effectiveDate?: string; expirationDate?: string; stateLicenses?: License[]; lineOfAuthority?: unknown; ahAuthority?: unknown; individualClassification?: string };
type Seed = {
  brokerages?: Brokerage[];
  agents?: Agent[];
  stateLicenses?: License[];
  licensingRules?: typeof AH_LICENSING_RULES;
  [key: string]: unknown;
};

function loadAuthoritativeSeed(): Seed {
  // The imported source workbook is a private workspace asset, never a Vite
  // public asset. It is read once and converted to the seed used by both the
  // protected client bootstrap and authoritative validation.
  const filename = "Broker_and_Agent_Licensing_Master_Suite_(1)_(1)_1787943478780.html";
  const candidates = [
    resolve(process.cwd(), "attached_assets", filename),
    resolve(process.cwd(), "../../attached_assets", filename),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("Private licensing seed source is unavailable.");
  const source = readFileSync(path, "utf8");

  const extractJsonArray = <T>(name: string): T[] => {
    const marker = new RegExp(`\\blet\\s+${name}\\s*=\\s*`);
    const match = marker.exec(source);
    if (!match) throw new Error(`Private licensing seed is missing ${name}.`);
    const start = source.indexOf("[", match.index + match[0].length);
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") quoted = false;
      } else if (character === "\"") quoted = true;
      else if (character === "[") depth += 1;
      else if (character === "]" && --depth === 0) {
        return JSON.parse(source.slice(start, index + 1)) as T[];
      }
    }
    throw new Error(`Private licensing seed has invalid ${name} data.`);
  };

  const brokerages = extractJsonArray<Record<string, unknown>>("brokerages");
  const agents = extractJsonArray<Record<string, unknown>>("agents");
  const communicationCadenceItems = extractJsonArray<Record<string, unknown>>("commsTemplates");
  const stateLicenses = agents.flatMap((agent) =>
    ((agent.stateLicenses as Record<string, unknown>[] | undefined) ?? []).map((license) => ({
      agentId: agent.id,
      agentName: agent.name,
      brokerage: agent.brokerage,
      ...license,
    })),
  );
  const communicationLogItems = [
    { timestamp: "2026-07-20 09:15", recipient: "jennifer.morrison@example.com", entity: "Agent", trigger: "90 Days Notice", subject: "Notice 1: Courtesy State License Renewal Reminder", status: "Delivered" },
    { timestamp: "2026-07-19 14:30", recipient: "brandon.walton@example.com", entity: "Agent", trigger: "30 Days Notice", subject: "Notice 3: Final Notice - License Expiration Approaching", status: "Delivered" },
  ];
  const niprAppointments = [
    { state: "PA", ruleType: "Pre-Appointment", lifespan: "Biennial", lob: "A&H, Life", fee: 15, highFeeThreshold: false, jitWindow: "N/A" },
    { state: "NY", ruleType: "Register-Only", lifespan: "Perpetual", lob: "A&H", fee: 20, highFeeThreshold: false, jitWindow: "N/A" },
    { state: "FL", ruleType: "Just-In-Time (JIT)", lifespan: "Annual", lob: "A&H", fee: 250, highFeeThreshold: true, jitWindow: "15 Days" },
    { state: "NJ", ruleType: "Pre-Appointment", lifespan: "Biennial", lob: "A&H, P&C", fee: 40, highFeeThreshold: false, jitWindow: "N/A" },
    { state: "IL", ruleType: "Just-In-Time (JIT)", lifespan: "Annual", lob: "A&H", fee: 50, highFeeThreshold: false, jitWindow: "30 Days" },
    { state: "TX", ruleType: "Just-In-Time (JIT)", lifespan: "Biennial", lob: "A&H", fee: 20, highFeeThreshold: false, jitWindow: "15 Days" },
  ];
  const documents = [
    { id: "DOC-101", name: "PA_State_License_2026.pdf", entity: "Jennifer Morrison", tag: "License", date: "2026-01-21" },
    { id: "DOC-102", name: "Aon_Corporate_DOI_Approval.pdf", entity: "Aon", tag: "DOI Doc", date: "2024-05-26" },
  ];
  const notes = [
    { id: "NTE-01", entity: "Jennifer Morrison", text: "Submitted Florida NIPR appointment renewal application.", date: "2026-07-20 10:30", author: "Compliance Admin" },
  ];
  const templateTitles: Record<string, string> = {
    "doc-pa-policy": "Blanket Accident Policy",
    "doc-fl-policy": "Blanket Accident Policy",
    "doc-pa-cert": "Certificate of Insurance",
    "doc-fl-cert": "Certificate of Insurance",
    "doc-hipaa": "HIPAA Privacy Notice",
    "doc-pa-privacy": "Pennsylvania State Privacy Notice",
    "doc-fl-privacy": "Florida State Privacy Notice",
    "doc-ofac": "OFAC Compliance Notice",
    "doc-end-comp": "Comprehensive Policy Endorsement",
    "doc-ren": "Policy Renewal Agreement",
    "doc-trust-pol": "Master Trust Blanket Policy",
  };
  const extractElementContent = (id: string): string => {
    const idIndex = source.indexOf(`id="${id}"`);
    const openStart = source.lastIndexOf("<div", idIndex);
    const openEnd = source.indexOf(">", idIndex) + 1;
    if (idIndex < 0 || openStart < 0 || openEnd <= 0) throw new Error(`Private licensing seed is missing ${id}.`);
    const tags = /<\/?div\b[^>]*>/gi;
    tags.lastIndex = openStart;
    let depth = 0;
    let tag: RegExpExecArray | null;
    while ((tag = tags.exec(source))) {
      if (tag[0].startsWith("</")) depth -= 1;
      else depth += 1;
      if (depth === 0) return source.slice(openEnd, tag.index).trim();
    }
    throw new Error(`Private licensing seed has invalid ${id} markup.`);
  };
  const documentTemplates = Object.entries(templateTitles).map(([tabId, title]) => ({
    id: `tab-content-${tabId}`,
    title,
    contentHtml: extractElementContent(`tab-content-${tabId}`),
  }));

  return {
    licensingRules: AH_LICENSING_RULES,
    sourceMetadata: {
      sourceFilename: filename,
      importedCounts: {
        brokerages: brokerages.length,
        agents: agents.length,
        stateLicenses: stateLicenses.length,
        communicationCadenceItems: communicationCadenceItems.length,
        communicationLogItems: communicationLogItems.length,
        niprAppointments: niprAppointments.length,
        documents: documents.length,
        notes: notes.length,
        documentTemplates: documentTemplates.length,
      },
    },
    brokerages,
    agents,
    stateLicenses,
    communicationCadenceItems,
    communicationLogItems,
    niprAppointments,
    documents,
    notes,
    documentTemplates,
  };
}

type CanonicalState = Record<string, unknown>;
const recordArray = z.array(z.record(z.unknown())).default([]);
const stateInput = z.object({
  brokerages: recordArray,
  agents: recordArray,
  stateLicenses: recordArray,
  niprAppointments: recordArray,
  documents: recordArray,
  documentTemplates: recordArray,
  notes: recordArray,
  communicationCadence: recordArray,
  communicationCadenceItems: recordArray.optional(),
  communicationLog: recordArray,
  communicationLogItems: recordArray.optional(),
}).passthrough();
const stateUpdateInput = z.object({
  version: z.number().int().positive(),
  state: stateInput,
}).superRefine((value, context) => {
  const agencies = value.state.brokerages;
  const producers = value.state.agents;
  const licenses = value.state.stateLicenses;
  const unique = (records: Record<string, unknown>[], keys: string[], label: string) => keys.forEach((key) => {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      const normalized = String(record[key] ?? "").trim().toLowerCase();
      if (!normalized) return;
      if (seen.has(normalized)) context.addIssue({ code: "custom", path: ["state", label, index, key], message: `Duplicate ${label} ${key}.` });
      seen.add(normalized);
    });
  });
  unique(agencies, ["id", "name", "brokerNumber", "npn"], "brokerages");
  unique(producers, ["id", "npn", "licenseNumber"], "agents");
  const agencyIds = new Set(agencies.map((agency) => String(agency.id ?? "")));
  agencies.forEach((agency, index) => {
    if (!String(agency.id ?? "").trim() || !String(agency.name ?? "").trim()) context.addIssue({ code: "custom", path: ["state", "brokerages", index], message: "Agency id and name are required." });
    if (agency.entityClassification && agency.entityClassification !== "entity") context.addIssue({ code: "custom", path: ["state", "brokerages", index, "entityClassification"], message: "Agency classification must be entity." });
  });
  producers.forEach((producer, index) => {
    if (!String(producer.id ?? "").trim() || !String(producer.name ?? "").trim() || !String(producer.npn ?? "").trim()) context.addIssue({ code: "custom", path: ["state", "agents", index], message: "Producer id, name, and NPN are required." });
    if (producer.individualClassification && producer.individualClassification !== "individual") context.addIssue({ code: "custom", path: ["state", "agents", index, "individualClassification"], message: "Producer classification must be individual." });
    if (!agencyIds.has(String(producer.brokerageId ?? ""))) context.addIssue({ code: "custom", path: ["state", "agents", index, "brokerageId"], message: "Producer agency relationship is invalid." });
  });
  const licenseKeys = new Set<string>();
  licenses.forEach((license, index) => {
    const state = String(license.state ?? "").toUpperCase();
    const identity = `${license.agentId}|${state}`;
    if (licenseKeys.has(identity)) context.addIssue({ code: "custom", path: ["state", "stateLicenses", index], message: "Duplicate producer jurisdiction license." });
    licenseKeys.add(identity);
    if (!stateRule(state)) context.addIssue({ code: "custom", path: ["state", "stateLicenses", index, "state"], message: "Unsupported jurisdiction." });
    if (!hasAhAuthority(license.lineOfAuthority ?? license.ahAuthority ?? license.loa)) context.addIssue({ code: "custom", path: ["state", "stateLicenses", index], message: "A&H authority is required." });
  });
});
const appointmentWorkItemCreateInput = z.object({
  version: z.number().int().positive(),
  item: z.record(z.unknown()),
});
const appointmentTransitionInput = z.object({
  version: z.number().int().positive(),
  action: z.enum(["submit", "resolve", "cancel", "terminate"]),
  reason: z.string().trim().min(3).max(1000),
});
const transportSubmitInput = z.object({
  mode: z.enum(["simulation", "live"]),
  operationId: z.string().trim().min(1).max(200),
  transaction: z.record(z.unknown()),
});
const transportModeInput = z.object({
  version: z.number().int().positive(),
  mode: z.enum(["simulation", "live"]),
});
const transportCallbackInput = z.object({
  operationId: z.string().trim().min(1).max(200),
  eventId: z.string().trim().min(1).max(200),
  sequence: z.number().int().nonnegative(),
  externalTransactionId: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).max(100),
  externalConfirmation: z.boolean(),
  occurredAt: z.string().trim().max(100).optional(),
});

const canonicalDate = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    ?? raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)?.slice().map((part, index) =>
      index === 0 ? part : index === 1 ? part[2] : index === 2 ? part[0] : part[1],
    );
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
};

function canonicalState(
  input: z.infer<typeof stateInput>,
  audit?: Record<string, unknown> | Record<string, unknown>[],
  serverAuditLogs: unknown[] = [],
  serverManagedState?: CanonicalState,
  serverActor = "system",
): CanonicalState {
  const dates = (item: Record<string, unknown>) => ({
    ...item,
    effectiveDate: canonicalDate(item.effectiveDate ?? item.effDate ?? item.effective),
    expirationDate: canonicalDate(item.expirationDate ?? item.expDate ?? item.expiration),
  });
  const brokerages = input.brokerages.map((item) => ({
    ...dates(item),
    states: Array.isArray(item.states) ? item.states.map((state) => String(state).trim().toUpperCase()).filter(Boolean) : [],
    commissionMin: item.commissionMin ?? 0,
    commissionDefault: item.commissionDefault ?? 10,
    commissionMax: item.commissionMax ?? 20,
  }));
  const communicationCadence = input.communicationCadence.length
    ? input.communicationCadence
    : (input.communicationCadenceItems ?? []);
  const communicationLog = input.communicationLog.length
    ? input.communicationLog
    : (input.communicationLogItems ?? []);
  const brokerageByName = new Map(brokerages.map((brokerage) => {
    const record = brokerage as Record<string, unknown>;
    return [normalize(record.name), record];
  }));
  const agents = input.agents.map((item) => {
    const referencedBrokerage = brokerageByName.get(normalize(item.brokerage));
    const brokerageId = String(item.brokerageId ?? referencedBrokerage?.id ?? "").trim();
    return {
      ...dates(item),
      // New suite records use brokerageId. Imported/seeded records often only
      // carry brokerage's name, so retain both representations.
      brokerageId,
      brokerage: typeof item.brokerage === "string"
        ? item.brokerage
        : (referencedBrokerage?.name ?? ""),
    };
  });
  const { auditLogs: _clientAuditLogs, ...safeInput } = input;
  const existingAudit = serverAuditLogs;
  void _clientAuditLogs;
  const generatedAudits = Array.isArray(audit) ? audit : audit ? [audit] : [];
  const mergedAudit = mergeServerAudits(generatedAudits, existingAudit);
  const protectedAppointmentState = serverManagedState ? {
    appointmentWorkItems: Array.isArray(serverManagedState.appointmentWorkItems) ? serverManagedState.appointmentWorkItems : [],
    appointmentOutbox: Array.isArray(serverManagedState.appointmentOutbox) ? serverManagedState.appointmentOutbox : [],
    appointmentLedger: Array.isArray(serverManagedState.appointmentLedger) ? serverManagedState.appointmentLedger : [],
  } : {};
  const existingTransport = serverManagedState?.regulatoryTransport && typeof serverManagedState.regulatoryTransport === "object"
    ? serverManagedState.regulatoryTransport as Record<string, unknown>
    : null;
  const protectedMode = serverManagedState?.licensingMode === "live"
    && existingTransport?.ready === true
    && existingTransport.liveActivationAllowed === true
    ? "live"
    : "simulation";
  const protectedTransportState = existingTransport
    ? {
        ...existingTransport,
        mode: protectedMode,
        ready: protectedMode === "live" && existingTransport.ready === true,
      }
    : {
        mode: "simulation",
        provider: null,
        capability: "appointment-submission",
        configured: false,
        authorized: false,
         capabilityAuthorized: false,
         callbackConfigured: false,
         certificationReviewed: false,
         liveActivationAllowed: false,
        healthy: false,
        ready: false,
        status: "NOT_CONFIGURED",
        missing: ["supported provider", "HTTPS gateway URL", "supported capability", "authorization", "healthy connection"],
        contracts: REGULATORY_TRANSPORT_CONTRACTS,
      };
  return {
    ...safeInput,
    ...protectedAppointmentState,
    licensingRules: AH_LICENSING_RULES,
    licensingMode: protectedMode,
    regulatoryTransport: protectedTransportState,
    brokerages,
    agents,
    stateLicenses: input.stateLicenses.map((item) => ({ ...dates(item), status: item.status ?? (item.active ? "Active" : "Expired") })),
    communicationCadence,
    communicationLog,
    auditLogs: mergedAudit,
  };
}

function response(record: typeof licensingStateTable.$inferSelect) {
  return {
    state: record.state as CanonicalState,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

async function currentState() {
  const found = await db.select().from(licensingStateTable).where(eq(licensingStateTable.id, 1));
  if (found[0]) {
    const state = found[0].state as CanonicalState;
    if (!state.licensingRules) return { ...found[0], state: { ...state, licensingRules: AH_LICENSING_RULES } };
    return found[0];
  }
  // The private import is used exactly once: a conflicting initializer always
  // reads the established row instead of replacing another user's changes.
  const initial = canonicalState(stateInput.parse(loadAuthoritativeSeed()));
  await db.insert(licensingStateTable).values({
    id: 1,
    state: initial,
    version: 1,
    updatedBy: "system:private-seed",
  }).onConflictDoNothing();
  const created = await db.select().from(licensingStateTable).where(eq(licensingStateTable.id, 1));
  if (!created[0]) throw new Error("Unable to initialize licensing state.");
  return created[0];
}

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
const parseDate = (value: unknown): Date | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = /^\d{2}\/\d{2}\/\d{4}$/.test(raw)
    ? `${raw.slice(6)}-${raw.slice(0, 2)}-${raw.slice(3, 5)}`
    : raw;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
};

function authorityStatus(record: { status?: string; effDate?: string; expDate?: string; effectiveDate?: string; expirationDate?: string }, effective: Date): string | null {
  if (normalize(record.status) !== "active") return "inactive";
  const starts = parseDate(record.effectiveDate ?? record.effDate);
  const expires = parseDate(record.expirationDate ?? record.expDate);
  if (!starts || !expires) return "invalid_dates";
  if (effective < starts) return "not_yet_effective";
  if (effective > expires) return "expired";
  return null;
}

router.post("/licensing/validate", async (req, res, next) => {
  try {
    const input = req.body as Record<string, unknown> | null;
    const brokerageName = normalize(input?.brokerageName);
    const agentName = normalize(input?.agentName);
    const state = String(input?.state ?? "").trim().toUpperCase();
    const effective = parseDate(input?.effectiveDate);
    const reasons: Array<{ code: string; message: string; severity: "error" | "warning" }> = [];
    const decisionTrace: Array<Record<string, unknown>> = [];
    const product = String(input?.product ?? input?.productLine ?? "A&H product").trim() || "A&H product";
    const carrier = String(input?.carrier ?? "Selected carrier").trim() || "Selected carrier";
    const carrierCode = String(input?.carrierCode ?? input?.coCode ?? "").trim();
    const fail = (code: string, message: string) => res.status(422).json({
      valid: false, hardBlock: true, code, reasonCode: code, error: message,
      reasons: [{ code, message, severity: "error" }], advisory: [],
      decisionTrace: decisionTrace.concat([{ step: "PAS action", status: "blocked", detail: message }]),
      productResolution: { product, requiredLoa: "Accident & Health", source: "A&H licensing rules", authoritative: true },
      sourceMetadata: { sourceFile: AH_LICENSING_RULES.source.file, sourceEffectiveDate: AH_LICENSING_RULES.source.effectiveDate, liveNipr: false },
      evidence: { state, effectiveDate: input?.effectiveDate ?? null, product, carrier, carrierCode },
    });
    if (!brokerageName || !agentName || !/^[A-Z]{2}$/.test(state)) {
      return res.status(400).json({ valid: false, code: "INVALID_SELECTION", error: "brokerageName, agentName, and two-letter state are required." });
    }
    if (!effective) return fail(LICENSING_REASON_CODES.INVALID_EFFECTIVE_DATE, "The policy effective date is invalid.");
    decisionTrace.push({
      step: "Context resolution",
      status: "completed",
      detail: `${product} · ${state || "state not supplied"} · effective ${input?.effectiveDate ?? "not supplied"}`,
      source: "Application transaction",
    });
    const rules = stateRule(state);
    if (!rules.individual || !rules.appointment) return fail(LICENSING_REASON_CODES.UNSUPPORTED_STATE, `A&H licensing rules are not available for ${state}.`);
    decisionTrace.push({
      step: "Product / LOA resolution",
      status: "completed",
      detail: `${product} resolves to Accident & Health authority.`,
      requiredLoa: rules.individual.lineOfAuthority,
      ruleId: rules.individual.id,
      source: AH_LICENSING_RULES.source.file,
    });

    const stateData = (await currentState()).state as Seed;
    const brokerage = stateData.brokerages?.find((item) => normalize(item.name) === brokerageName);
    if (!brokerage) return fail(LICENSING_REASON_CODES.BROKERAGE_NOT_FOUND, "Brokerage authority was not found.");
    const brokerageStatus = authorityStatus(brokerage, effective);
    if (brokerageStatus === "inactive") return fail(LICENSING_REASON_CODES.BROKERAGE_INACTIVE, "Brokerage authority is inactive.");
    if (brokerageStatus === "invalid_dates") return fail(LICENSING_REASON_CODES.BROKERAGE_INVALID_DATES, "Brokerage authority has invalid effective or expiration dates.");
    if (brokerageStatus === "not_yet_effective") return fail(LICENSING_REASON_CODES.BROKERAGE_NOT_YET_EFFECTIVE, "Brokerage authority is not effective for the policy date.");
    if (brokerageStatus === "expired") return fail(LICENSING_REASON_CODES.BROKERAGE_EXPIRED, "Brokerage authority is expired for the policy date.");
    if (brokerage.entityClassification && brokerage.entityClassification !== "entity") {
      return fail(LICENSING_REASON_CODES.BROKERAGE_CLASSIFICATION_INVALID, "The selected brokerage record is not classified as an entity authority.");
    }
    if (!brokerage.states?.map((item) => item.toUpperCase()).includes(state)) {
      return fail(LICENSING_REASON_CODES.BROKERAGE_STATE_UNAUTHORIZED, "Brokerage is not authorized in the policyholder state.");
    }
    if (rules.entity && !hasAhAuthority(brokerage.ahAuthority ?? brokerage.lineOfAuthority ?? (brokerage as Record<string, unknown>).licenses, rules.entity.licenseType)) {
      return fail(LICENSING_REASON_CODES.BROKERAGE_AH_AUTHORITY_MISSING, `Brokerage does not show Accident & Health authority required in ${state}.`);
    }
    const brokerageId = String((brokerage as Record<string, unknown>).id ?? "").trim();
    decisionTrace.push({
      step: "Brokerage license authority",
      status: "completed",
      detail: `${brokerage.name} is active and authorized in ${state}.`,
      brokerageId,
    });
    const agent = stateData.agents?.find((item) => {
      if (normalize(item.name) !== agentName) return false;
      const agentRecord = item as Record<string, unknown>;
      return (brokerageId && String(agentRecord.brokerageId ?? "").trim() === brokerageId)
        || normalize(agentRecord.brokerage) === normalize(brokerage.name);
    });
    if (!agent) return fail(LICENSING_REASON_CODES.AGENT_NOT_FOUND, "Agent authority was not found for this brokerage.");
    const agentStatus = authorityStatus(agent, effective);
    if (agentStatus === "inactive") return fail(LICENSING_REASON_CODES.AGENT_INACTIVE, "Agent authority is inactive.");
    if (agentStatus === "invalid_dates") return fail(LICENSING_REASON_CODES.AGENT_INVALID_DATES, "Agent authority has invalid effective or expiration dates.");
    if (agentStatus === "not_yet_effective") return fail(LICENSING_REASON_CODES.AGENT_NOT_YET_EFFECTIVE, "Agent authority is not effective for the policy date.");
    if (agentStatus === "expired") return fail(LICENSING_REASON_CODES.AGENT_EXPIRED, "Agent authority is expired for the policy date.");
    if (agent.individualClassification && agent.individualClassification !== "individual") {
      return fail(LICENSING_REASON_CODES.AGENT_CLASSIFICATION_INVALID, "The selected agent record is not classified as an individual producer.");
    }
    if (!hasAhAuthority(agent.ahAuthority ?? agent.lineOfAuthority ?? (agent as Record<string, unknown>).loa, rules.individual.licenseType)) {
      return fail(LICENSING_REASON_CODES.AGENT_AH_AUTHORITY_MISSING, `Agent does not show Accident & Health authority required in ${state}.`);
    }
    const agentId = String((agent as Record<string, unknown>).id ?? "").trim();
    const stateLicense = stateData.stateLicenses?.find((item) =>
      item.state?.toUpperCase() === state && String(item.agentId ?? "").trim() === agentId,
    ) ?? agent.stateLicenses?.find((item) => item.state?.toUpperCase() === state);
    if (!stateLicense) return fail(LICENSING_REASON_CODES.AGENT_LICENSE_MISSING, "Agent does not have an A&H license in the policyholder state.");
    if (!hasAhAuthority((stateLicense as Record<string, unknown>).lineOfAuthority ?? (stateLicense as Record<string, unknown>).loa ?? (stateLicense as Record<string, unknown>).type, rules.individual.licenseType)) {
      return fail(LICENSING_REASON_CODES.AGENT_AH_AUTHORITY_MISSING, "Agent state license does not include the required A&H line of authority.");
    }
    const licenseStatus = authorityStatus(stateLicense, effective);
    if (licenseStatus === "inactive") return fail(LICENSING_REASON_CODES.AGENT_LICENSE_INACTIVE, "Agent state license is inactive.");
    if (licenseStatus === "invalid_dates") return fail(LICENSING_REASON_CODES.AGENT_LICENSE_INVALID_DATES, "Agent state license has invalid effective or expiration dates.");
    if (licenseStatus === "not_yet_effective") return fail(LICENSING_REASON_CODES.AGENT_LICENSE_NOT_YET_EFFECTIVE, "Agent state license is not effective for the policy date.");
    if (licenseStatus === "expired") return fail(LICENSING_REASON_CODES.AGENT_LICENSE_EXPIRED, "Agent state license is expired for the policy date.");
    decisionTrace.push({
      step: "Producer license authority",
      status: "completed",
      detail: `${agent.name} has active A&H authority in ${state} for the requested date.`,
      agentId,
      licenseId: (stateLicense as Record<string, unknown>).id ?? null,
    });

    const appointmentResult = evaluateAppointment(state, input?.appointmentStatus ?? (stateData.niprAppointments as Array<Record<string, unknown>> | undefined)?.find((item) => String(item.agentId) === agentId)?.status);
    if (appointmentResult.advisory) reasons.push(appointmentResult.advisory);
    const appointmentRule = appointmentResult.rule;
    const requestedDate = input?.effectiveDate ?? null;
    const filingWindowDays = appointmentRule?.filingWindowDays ?? null;
    const filingDeadline = filingWindowDays !== null && effective
      ? new Date(effective.getTime() + filingWindowDays * 86400000).toISOString().slice(0, 10)
      : null;
    decisionTrace.push({
      step: "Carrier appointment",
      status: appointmentResult.advisory ? "advisory" : "completed",
      detail: appointmentResult.advisory
        ? appointmentResult.advisory.message
        : /^(appointed|active)$/i.test(String(input?.appointmentStatus ?? "").trim())
          ? `${carrier} appointment was operator-attested for this evaluation; it was not externally verified.`
          : `${carrier} appointment is not required by the configured rule.`,
      carrier,
      carrierCode: carrierCode || null,
      appointmentStatus: input?.appointmentStatus ?? "Not appointed",
      appointmentStatusSource: input?.appointmentStatusSource ?? "Operator input",
      externallyVerified: false,
    });
    decisionTrace.push({
      step: "State appointment rule",
      status: "completed",
      detail: appointmentRule ? `${state} uses ${appointmentRule.ruleType}.` : "No appointment rule is available.",
      ruleType: appointmentRule?.ruleType ?? null,
      requiredParty: appointmentRule?.requiredParty ?? null,
      ruleId: appointmentRule?.id ?? null,
      source: appointmentRule?.sourceFile ?? AH_LICENSING_RULES.source.file,
    });
    decisionTrace.push({
      step: "Filing window and fee",
      status: "completed",
      detail: filingWindowDays === null ? "No filing window or fee is recorded in the authoritative workbook." : `${filingWindowDays} days from the requested effective date.`,
      requestedEffectiveDate: requestedDate,
      filingWindowDays,
      filingDeadline,
      fee: appointmentRule?.fee ?? null,
      source: appointmentRule?.sourceFile ?? AH_LICENSING_RULES.source.file,
    });
    decisionTrace.push({
      step: "PAS action",
      status: appointmentResult.advisory ? "advisory" : "approved",
      detail: appointmentResult.advisory
        ? "Continue under the existing advisory-only appointment policy; no live filing or approval is implied."
        : "License authority is valid for quote or bind progression.",
      action: appointmentResult.outcome,
    });
    return res.json({
      valid: true, hardBlock: false, code: reasons.length ? "VALID_WITH_APPOINTMENT_ADVISORY" : "VALID",
      reasonCode: reasons.length ? "VALID_WITH_APPOINTMENT_ADVISORY" : "VALID",
      reasons, advisory: reasons, appointment: appointmentResult.rule,
      appointmentOutcome: appointmentResult.outcome,
      brokerage: brokerage.name, agent: agent.name, state, effectiveDate: input?.effectiveDate,
      product, carrier, carrierCode: carrierCode || null,
      filingWindow: { filingWindowDays, filingDeadline, fee: appointmentRule?.fee ?? null },
      decisionTrace,
      productResolution: { product, requiredLoa: rules.individual.lineOfAuthority, source: AH_LICENSING_RULES.source.file, authoritative: true },
      sourceMetadata: { sourceFile: AH_LICENSING_RULES.source.file, sourceEffectiveDate: AH_LICENSING_RULES.source.effectiveDate, liveNipr: false },
      evidence: { state, effectiveDate: input?.effectiveDate, brokerageId, brokerageName: brokerage.name, agentId, agentName: agent.name, agentLicenseId: (stateLicense as Record<string, unknown>).id ?? null, entityRuleId: rules.entity?.id ?? null, individualRuleId: rules.individual.id, appointmentRuleId: rules.appointment.id },
    });
  } catch (error) {
    next(error);
    return;
  }
});

router.get("/licensing/state", async (_req, res, next) => {
  try {
    res.json(response(await currentState()));
  } catch (error) {
    next(error);
  }
});

router.put("/licensing/state", updateState);
router.patch("/licensing/state", updateState);

function redactAuditValue(value: unknown, key = ""): unknown {
  const sensitive = /email|phone|ein|npn|license(number)?|ssn|token|secret|password|credential/i.test(key);
  if (sensitive && value != null && typeof value !== "object") {
    const raw = String(value);
    return raw.length <= 4 ? "••••" : `••••${raw.slice(-4)}`;
  }
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      redactAuditValue(childValue, childKey),
    ]));
  }
  if (typeof value === "string") {
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
      .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[redacted-id]")
      .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]")
      .replace(/\b\d{7,}\b/g, "[redacted-number]");
  }
  return value;
}

function appointmentAudit(
  action: string,
  details: Record<string, unknown>,
  entityId: string,
  actor: string,
  now: Date,
  metadata: Record<string, unknown> = {},
) {
  const operationId = String(metadata.operationId ?? details.operationId ?? `OP-${now.getTime()}`);
  return {
    id: `A-server-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    action,
    details: JSON.stringify(redactAuditValue(details)),
    entityId,
    updatedBy: actor,
    category: "Licensing & DOI",
    eventType: action,
    status: metadata.status ?? "Completed",
    source: metadata.source ?? "Protected licensing workspace",
    mode: metadata.mode ?? "simulation",
    direction: metadata.direction ?? "internal",
    operationId,
    correlationId: metadata.correlationId ?? operationId,
    jurisdiction: metadata.jurisdiction ?? details.state ?? null,
    entityLinks: redactAuditValue(metadata.entityLinks ?? { entityId }),
    metadata: redactAuditValue({ ...metadata, operationId }),
  };
}

function appointmentPayload(item: Record<string, unknown>, now: Date) {
  return {
    schema: "tinubu.simulated-nipr-appointment.v1",
    simulated: true,
    generatedAt: now.toISOString(),
    transport: {
      provider: "simulation",
      mode: "simulation",
      operationId: item.operationId,
      request: "appointment-submission",
      acknowledgement: "simulated-accepted",
      asynchronousResponse: "simulated-review-response",
      error: null,
      retry: { supported: true, policy: "operator-reviewed" },
    },
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
      carrierCode: item.carrierCode ?? null,
      appointmentRuleId: item.appointmentRuleId,
      appointmentRuleType: item.appointmentRuleType,
      requiredParty: item.requiredParty,
      requiredLoa: item.requiredLoa,
      applicationDate: item.applicationDate,
      requestedEffectiveDate: item.requestedEffectiveDate,
      filingWindowDays: item.filingWindowDays,
      filingDeadline: item.filingDeadline,
      fee: item.fee,
    },
    evidence: item.evidence,
    notice: "Simulation only. No NIPR, state DOI, carrier, payment, or accounting submission occurred.",
  };
}

router.post("/licensing/appointment-work-items", async (req, res, next) => {
  try {
    const input = appointmentWorkItemCreateInput.parse(req.body);
    const current = await currentState();
    if (current.version !== input.version) {
      return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(current) });
    }
    const state = String(input.item.state ?? "").trim().toUpperCase();
    const rules = stateRule(state);
    const rule = rules.appointment;
    if (!rule || !rules.individual) return res.status(422).json({ error: `No authoritative appointment rule is available for ${state}.` });
    const effective = parseDate(input.item.requestedEffectiveDate);
    if (!effective) return res.status(422).json({ error: "A valid requested effective date is required." });
    const currentStateValue = current.state as CanonicalState;
    const brokerage = (currentStateValue.brokerages as Brokerage[] | undefined)?.find((entry) =>
      String((entry as Record<string, unknown>).id ?? "") === String(input.item.brokerageId ?? ""),
    );
    const agent = (currentStateValue.agents as Agent[] | undefined)?.find((entry) =>
      String((entry as Record<string, unknown>).id ?? "") === String(input.item.producerId ?? ""),
    );
    if (!brokerage || authorityStatus(brokerage, effective) || !brokerage.states?.map((entry) => entry.toUpperCase()).includes(state)) {
      return res.status(422).json({ error: "The brokerage no longer has active authority for this state and effective date." });
    }
    if (brokerage.entityClassification && brokerage.entityClassification !== "entity") {
      return res.status(422).json({ error: "The selected brokerage is not classified as an entity authority." });
    }
    if (rules.entity && !hasAhAuthority(brokerage.ahAuthority ?? brokerage.lineOfAuthority ?? (brokerage as Record<string, unknown>).licenses, rules.entity.licenseType)) {
      return res.status(422).json({ error: "The brokerage no longer shows the required A&H authority." });
    }
    const brokerageId = String((brokerage as Record<string, unknown>).id ?? "");
    const agentBrokerageId = String((agent as Record<string, unknown> | undefined)?.brokerageId ?? "");
    const agentBrokerageName = normalize((agent as Record<string, unknown> | undefined)?.brokerage);
    if (!agent || authorityStatus(agent, effective)
      || !((brokerageId && agentBrokerageId === brokerageId) || agentBrokerageName === normalize(brokerage.name))) {
      return res.status(422).json({ error: "The producer no longer has active authority for this effective date." });
    }
    if (agent.individualClassification && agent.individualClassification !== "individual") {
      return res.status(422).json({ error: "The selected producer is not classified as an individual authority." });
    }
    if (!hasAhAuthority(agent.ahAuthority ?? agent.lineOfAuthority ?? (agent as Record<string, unknown>).loa, rules.individual.licenseType)) {
      return res.status(422).json({ error: "The producer no longer shows the required A&H authority." });
    }
    const agentId = String((agent as Record<string, unknown>).id ?? "");
    const stateLicense = (currentStateValue.stateLicenses as License[] | undefined)?.find((entry) =>
      String(entry.agentId ?? "") === agentId && String(entry.state ?? "").toUpperCase() === state,
    ) ?? agent.stateLicenses?.find((entry) => String(entry.state ?? "").toUpperCase() === state);
    if (!stateLicense || authorityStatus(stateLicense, effective) || !hasAhAuthority((stateLicense as Record<string, unknown>).lineOfAuthority ?? (stateLicense as Record<string, unknown>).loa ?? (stateLicense as Record<string, unknown>).type)) {
      return res.status(422).json({ error: "The producer no longer has active A&H authority for this state and effective date." });
    }
    const now = new Date();
    const actor = req.userId ?? "unknown";
    const id = `AW-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
    const operationId = `OP-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
    const filingDeadlineDate = rule.filingWindowDays === null
      ? null
      : new Date(effective.getTime() + rule.filingWindowDays * 86400000).toISOString().slice(0, 10);
    const workItem: Record<string, unknown> = {
      id,
      operationId,
      correlationId: operationId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      actor,
      producerId: String(input.item.producerId ?? ""),
      producerName: agent.name,
      brokerageId: String(input.item.brokerageId ?? ""),
      brokerageName: brokerage.name,
      policyOrQuote: String(input.item.policyOrQuote ?? "Unlinked evaluation"),
      product: String(input.item.product ?? "A&H product"),
      state,
      carrier: String(input.item.carrier ?? "Carrier not supplied"),
      carrierCode: String(input.item.carrierCode ?? ""),
      appointmentRuleId: rule.id,
      appointmentRuleType: rule.ruleType,
      requiredParty: rule.requiredParty,
      requiredLoa: "Accident & Health",
      applicationDate: input.item.applicationDate ?? null,
      requestedEffectiveDate: input.item.requestedEffectiveDate ?? null,
      filingWindowDays: rule.filingWindowDays,
      filingDeadline: filingDeadlineDate,
      fee: rule.fee,
      status: rule.ruleType === "not-required" ? "NOT_REQUIRED" : "READY_FOR_REVIEW",
      evidence: {
        validation: {
          authoritative: true,
          brokerageId,
          producerId: agentId,
          state,
          effectiveDate: input.item.requestedEffectiveDate,
          brokerageEntityAuthority: true,
          brokerageAhAuthority: true,
          producerIndividualAuthority: true,
          producerAhAuthority: true,
          stateLicenseAhAuthority: true,
        },
        rule: {
          id: rule.id,
          type: rule.ruleType,
          requiredParty: rule.requiredParty,
          filingWindowDays: rule.filingWindowDays,
          fee: rule.fee,
        },
        sourceMetadata: {
          sourceFile: AH_LICENSING_RULES.source.file,
          sourceEffectiveDate: AH_LICENSING_RULES.source.effectiveDate,
          liveNipr: false,
          externalVerification: false,
        },
        operatorContext: {
          submittedAt: now.toISOString(),
          actor,
          carrier: String(input.item.carrier ?? ""),
          carrierCode: String(input.item.carrierCode ?? ""),
          reference: String(input.item.policyOrQuote ?? ""),
        },
      },
      history: [{ at: now.toISOString(), actor, action: "CREATED", reason: "Created from a server-approved appointment evaluation." }],
    };
    const workItems = Array.isArray(currentStateValue.appointmentWorkItems) ? currentStateValue.appointmentWorkItems as unknown[] : [];
    const priorAudit = Array.isArray(currentStateValue.auditLogs) ? currentStateValue.auditLogs as unknown[] : [];
    const audit = appointmentAudit("APPOINTMENT_WORK_ITEM_CREATED", { workItemId: id, state, status: workItem.status, operationId }, id, actor, now, {
      operationId,
      correlationId: operationId,
      status: workItem.status,
      source: "Authoritative A&H licensing evaluation",
      mode: "simulation",
      direction: "internal",
      entityLinks: { producerId: agentId, agencyId: brokerageId, workItemId: id },
    });
    const parsed = stateInput.parse({ ...currentStateValue, appointmentWorkItems: [workItem, ...workItems] });
    const nextState = canonicalState(parsed, audit, priorAudit, currentStateValue, actor);
    const updated = await db.update(licensingStateTable).set({
      state: nextState,
      version: sql`${licensingStateTable.version} + 1`,
      updatedAt: now,
      updatedBy: actor,
    }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, input.version))).returning();
    if (!updated[0]) return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(await currentState()) });
    return res.status(201).json(response(updated[0]));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid appointment work item.", issues: error.issues });
    return next(error);
  }
});

router.post("/licensing/appointment-work-items/:id/transition", async (req, res, next) => {
  try {
    const input = appointmentTransitionInput.parse(req.body);
    const current = await currentState();
    if (current.version !== input.version) {
      return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(current) });
    }
    const currentStateValue = current.state as CanonicalState;
    const workItems = Array.isArray(currentStateValue.appointmentWorkItems)
      ? (currentStateValue.appointmentWorkItems as Record<string, unknown>[]).map((item) => ({ ...item }))
      : [];
    const item = workItems.find((entry) => String(entry.id) === req.params.id);
    if (!item) return res.status(404).json({ error: "Appointment work item was not found." });
    const allowed: Record<string, string[]> = {
      submit: ["READY_FOR_REVIEW"],
      resolve: ["SUBMITTED_SIMULATED", "SUBMITTED_LIVE", "CONFIRMED_EXTERNAL"],
      cancel: ["READY_FOR_REVIEW", "SUBMITTED_SIMULATED"],
      terminate: ["RESOLVED_REVIEWED"],
    };
    if (!allowed[input.action].includes(String(item.status))) {
      return res.status(409).json({ error: `The ${input.action} action is not allowed while the work item is ${item.status}.` });
    }
    const beforeStatus = String(item.status);
    const now = new Date();
    const actor = req.userId ?? "unknown";
    const outbox = Array.isArray(currentStateValue.appointmentOutbox) ? [...currentStateValue.appointmentOutbox as unknown[]] : [];
    const ledger = Array.isArray(currentStateValue.appointmentLedger)
      ? (currentStateValue.appointmentLedger as Record<string, unknown>[]).map((entry) => ({ ...entry }))
      : [];
    const requestedLiveMode = currentStateValue.licensingMode === "live";
    const dispatchReadiness = input.action === "submit" && requestedLiveMode
      ? await regulatoryReadiness()
      : null;
    if (input.action === "submit" && requestedLiveMode && !dispatchReadiness?.liveActivationAllowed) {
      return res.status(503).json({
        accepted: false,
        mode: "simulation",
        status: dispatchReadiness?.ready
          ? "BLOCKED_CERTIFICATION_REVIEW_REQUIRED"
          : "BLOCKED_NOT_READY",
        error: dispatchReadiness?.ready
          ? "Live regulatory transport is blocked until sandbox certification evidence is reviewed."
          : "Live regulatory transport is not configured or verified.",
        readiness: dispatchReadiness,
      });
    }
    const liveMode = requestedLiveMode && dispatchReadiness?.liveActivationAllowed === true;
    let transportProvider = "simulation";
    let transportStatus = "SIMULATED_ACCEPTED";
    if (input.action === "submit" && liveMode) {
      const payload = appointmentPayload(item, now);
      const payloadDigest = createHash("sha256").update(JSON.stringify(payload.transaction)).digest("base64url");
      const outboxId = `AO-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      item.status = "SENDING_LIVE";
      item.outboxId = outboxId;
      item.updatedAt = now.toISOString();
      item.history = [{
        at: now.toISOString(),
        actor,
        action: "SUBMIT_CLAIMED",
        reason: input.reason,
        from: beforeStatus,
        to: item.status,
      }, ...(Array.isArray(item.history) ? item.history : [])];
      outbox.unshift({
        id: outboxId,
        workItemId: item.id,
        operationId: item.operationId,
        correlationId: item.operationId,
        payloadDigest,
        status: "DISPATCHING",
        mode: "live",
        provider: (currentStateValue.regulatoryTransport as Record<string, unknown> | undefined)?.provider ?? null,
        createdAt: now.toISOString(),
        actor,
        // Keep the durable claim intentionally minimal. The full provider
        // transaction is derived from the protected work item only in memory.
        transactionSummary: {
          workItemId: item.id,
          state: item.state,
          carrierCode: item.carrierCode ?? null,
          appointmentRuleId: item.appointmentRuleId,
        },
      });
      const priorAudit = Array.isArray(currentStateValue.auditLogs) ? currentStateValue.auditLogs as unknown[] : [];
      const claimAudit = appointmentAudit("APPOINTMENT_SUBMIT_CLAIMED", {
        workItemId: item.id,
        operationId: item.operationId,
        payloadDigest,
      }, String(item.id), actor, now, {
        operationId: item.operationId,
        correlationId: item.operationId,
        status: "Dispatching",
        source: (currentStateValue.regulatoryTransport as Record<string, unknown> | undefined)?.provider ?? "Regulatory gateway",
        mode: "live",
        direction: "request",
        entityLinks: { producerId: item.producerId, agencyId: item.brokerageId, workItemId: item.id },
      });
      const claimParsed = stateInput.parse({ ...currentStateValue, appointmentWorkItems: workItems, appointmentOutbox: outbox, appointmentLedger: ledger });
      const claimedState = canonicalState(claimParsed, claimAudit, priorAudit, currentStateValue, actor);
      const claimed = await db.update(licensingStateTable).set({
        state: claimedState,
        version: sql`${licensingStateTable.version} + 1`,
        updatedAt: now,
        updatedBy: actor,
      }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, input.version))).returning();
      if (!claimed[0]) {
        return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(await currentState()) });
      }

      const result = await createRegulatoryGatewayAdapter().submit({
        operationId: String(item.operationId),
        transaction: payload.transaction,
      });
      const latest = await currentState();
      const latestState = latest.state as CanonicalState;
      const latestItems = Array.isArray(latestState.appointmentWorkItems)
        ? (latestState.appointmentWorkItems as Record<string, unknown>[]).map((entry) => ({ ...entry }))
        : [];
      const latestItem = latestItems.find((entry) => String(entry.operationId) === String(item.operationId));
      if (!latestItem) return res.status(409).json({ error: "The claimed regulatory work item could not be reconciled.", current: response(latest) });
      const latestOutbox = Array.isArray(latestState.appointmentOutbox)
        ? (latestState.appointmentOutbox as Record<string, unknown>[]).map((entry) => ({ ...entry }))
        : [];
      const latestOutboxEntry = latestOutbox.find((entry) => String(entry.operationId) === String(item.operationId));
      const existingTransport = latestItem.transport && typeof latestItem.transport === "object"
        ? latestItem.transport as Record<string, unknown>
        : {};
      const existingResponse = existingTransport.asynchronousResponse && typeof existingTransport.asynchronousResponse === "object"
        ? existingTransport.asynchronousResponse as Record<string, unknown>
        : null;
      const existingConfirmation = existingResponse?.externalConfirmation === true || latestItem.status === "CONFIRMED_EXTERNAL";
      const externalConfirmation = existingConfirmation || result.asynchronousResponse?.externalConfirmation === true;
      const effectiveResponse = existingConfirmation
        ? existingResponse
        : result.asynchronousResponse;
      const failureUnknown = result.error?.code === "PROVIDER_NETWORK_ERROR" || result.error?.code === "PROVIDER_RETRY_EXHAUSTED";
      latestItem.status = externalConfirmation
        ? "CONFIRMED_EXTERNAL"
        : result.accepted
          ? "SUBMITTED_LIVE"
          : failureUnknown ? "SUBMISSION_UNKNOWN" : "SUBMISSION_FAILED";
      latestItem.updatedAt = new Date().toISOString();
      latestItem.transport = {
        ...result,
        asynchronousResponse: effectiveResponse,
      };
      latestItem.history = [{
        at: latestItem.updatedAt,
        actor,
        action: result.accepted ? "SUBMIT_ACKNOWLEDGED" : failureUnknown ? "SUBMIT_OUTCOME_UNKNOWN" : "SUBMIT_FAILED",
        reason: result.error?.message ?? result.asynchronousResponse?.status ?? result.acknowledgement?.status ?? "Provider response recorded.",
        from: "SENDING_LIVE",
        to: latestItem.status,
      }, ...(Array.isArray(latestItem.history) ? latestItem.history : [])];
      if (latestOutboxEntry) {
        latestOutboxEntry.status = latestItem.status;
        latestOutboxEntry.updatedAt = latestItem.updatedAt;
        latestOutboxEntry.transport = latestItem.transport;
      }
      const latestPriorAudit = Array.isArray(latestState.auditLogs) ? latestState.auditLogs as unknown[] : [];
      const resultAudit = appointmentAudit(
        result.accepted ? externalConfirmation ? "APPOINTMENT_EXTERNAL_CONFIRMED" : "APPOINTMENT_EXTERNAL_ACKNOWLEDGED" : failureUnknown ? "APPOINTMENT_SUBMISSION_UNKNOWN" : "APPOINTMENT_SUBMISSION_FAILED",
        {
          workItemId: latestItem.id,
          operationId: latestItem.operationId,
          status: latestItem.status,
          providerStatus: effectiveResponse?.status ?? result.acknowledgement?.status ?? result.error?.code,
          externalTransactionId: effectiveResponse?.externalTransactionId ?? result.acknowledgement?.externalTransactionId,
        },
        String(latestItem.id),
        actor,
        new Date(),
        {
          operationId: latestItem.operationId,
          correlationId: latestItem.operationId,
          status: latestItem.status,
          source: (latestState.regulatoryTransport as Record<string, unknown> | undefined)?.provider ?? "Regulatory gateway",
          mode: "live",
          direction: result.accepted ? "response" : "error",
          externalConfirmation,
          entityLinks: { producerId: latestItem.producerId, agencyId: latestItem.brokerageId, workItemId: latestItem.id },
        },
      );
      const latestParsed = stateInput.parse({ ...latestState, appointmentWorkItems: latestItems, appointmentOutbox: latestOutbox });
      const finalState = canonicalState(latestParsed, resultAudit, latestPriorAudit, latestState, actor);
      const finalized = await db.update(licensingStateTable).set({
        state: finalState,
        version: sql`${licensingStateTable.version} + 1`,
        updatedAt: new Date(),
        updatedBy: actor,
      }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, latest.version))).returning();
      if (!finalized[0]) {
        // The durable claim prevents another submission. Return the latest
        // canonical record and let a provider callback complete reconciliation.
        return res.status(202).json(response(await currentState()));
      }
      return res.status(result.accepted ? 200 : 202).json({ ...response(finalized[0]), transport: result });
    }
    if (input.action === "submit") {
      const outboxId = `AO-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
      item.outboxId = outboxId;
      const payload = appointmentPayload(item, now);
      item.status = "SUBMITTED_SIMULATED";
      outbox.unshift({ id: outboxId, workItemId: item.id, status: "SIMULATED_OUTBOX", mode: "simulation", createdAt: now.toISOString(), actor, payload });
      ledger.unshift(
        { id: `AL-${now.getTime()}-fee`, workItemId: item.id, policyOrQuote: item.policyOrQuote, producerId: item.producerId, state: item.state, type: "STATE_FEE", status: "PENDING", amount: typeof item.fee === "number" ? item.fee : null, currency: typeof item.fee === "number" ? "USD" : null, description: "Recorded state appointment fee pending reviewed resolution.", createdAt: now.toISOString(), actor },
        { id: `AL-${now.getTime()}-commission`, workItemId: item.id, policyOrQuote: item.policyOrQuote, producerId: item.producerId, state: item.state, type: "COMMISSION", status: "HELD", amount: null, currency: null, description: "Commission hold recorded pending appointment review.", createdAt: now.toISOString(), actor },
      );
    } else if (input.action === "resolve") {
      item.status = "RESOLVED_REVIEWED";
      item.resolution = { reason: input.reason, actor, at: now.toISOString(), externalConfirmation: false };
      ledger.forEach((entry) => {
        if (entry.workItemId === item.id && entry.type === "STATE_FEE" && entry.status === "PENDING") {
          entry.status = "SETTLED_RECORDED";
          entry.settledAt = now.toISOString();
        }
      });
      ledger.unshift({ id: `AL-${now.getTime()}-release`, workItemId: item.id, policyOrQuote: item.policyOrQuote, producerId: item.producerId, state: item.state, type: "COMMISSION", status: "RELEASED", amount: null, currency: null, description: "Commission hold released by reviewed workspace resolution; no external approval claimed.", createdAt: now.toISOString(), actor });
    } else if (input.action === "cancel") {
      item.status = "CANCELLED";
      item.cancellation = { reason: input.reason, actor, at: now.toISOString() };
      ledger.forEach((entry) => {
        if (entry.workItemId === item.id && entry.type === "STATE_FEE" && entry.status === "PENDING") {
          entry.status = "VOIDED";
          entry.voidedAt = now.toISOString();
        }
      });
      if (beforeStatus === "SUBMITTED_SIMULATED") {
        ledger.unshift({ id: `AL-${now.getTime()}-release`, workItemId: item.id, policyOrQuote: item.policyOrQuote, producerId: item.producerId, state: item.state, type: "COMMISSION", status: "RELEASED", amount: null, currency: null, description: "Commission hold released after simulated outbox cancellation.", createdAt: now.toISOString(), actor });
      }
    } else {
      item.status = "TERMINATED";
      item.termination = { reason: input.reason, actor, at: now.toISOString(), externalConfirmation: false };
      ledger.unshift({ id: `AL-${now.getTime()}-forfeit`, workItemId: item.id, policyOrQuote: item.policyOrQuote, producerId: item.producerId, state: item.state, type: "COMMISSION", status: "FORFEITED", amount: null, currency: null, description: "Commission status marked forfeited by reviewed termination evidence; no amount recorded.", createdAt: now.toISOString(), actor });
    }
    item.updatedAt = now.toISOString();
    const history = Array.isArray(item.history) ? item.history : [];
    item.history = [{ at: now.toISOString(), actor, action: input.action.toUpperCase(), reason: input.reason, from: beforeStatus, to: item.status }, ...history];
    const priorAudit = Array.isArray(currentStateValue.auditLogs) ? currentStateValue.auditLogs as unknown[] : [];
    const audit = appointmentAudit(`APPOINTMENT_${input.action.toUpperCase()}`, {
      workItemId: item.id,
      from: beforeStatus,
      to: item.status,
      reason: input.reason,
      operationId: item.operationId,
      transportStatus: input.action === "submit" ? transportStatus : undefined,
    }, String(item.id), actor, now, {
      operationId: item.operationId,
      correlationId: item.correlationId ?? item.operationId,
      status: item.status,
      source: input.action === "submit" ? transportProvider : "Operator-reviewed appointment workflow",
      mode: input.action === "submit" && liveMode ? "live" : "simulation",
      direction: input.action === "submit" ? "request" : "internal",
      entityLinks: { producerId: item.producerId, agencyId: item.brokerageId, workItemId: item.id },
    });
    const parsed = stateInput.parse({ ...currentStateValue, appointmentWorkItems: workItems, appointmentOutbox: outbox, appointmentLedger: ledger });
    const nextState = canonicalState(parsed, audit, priorAudit, currentStateValue, actor);
    const updated = await db.update(licensingStateTable).set({
      state: nextState,
      version: sql`${licensingStateTable.version} + 1`,
      updatedAt: now,
      updatedBy: actor,
    }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, input.version))).returning();
    if (!updated[0]) return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(await currentState()) });
    return res.json(response(updated[0]));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid appointment transition.", issues: error.issues });
    return next(error);
  }
});

async function regulatoryReadiness(): Promise<RegulatoryTransportHealth> {
  return createRegulatoryGatewayAdapter().readiness();
}

function providerCallbackAuthorized(req: import("express").Request): "authorized" | "missing" | "invalid" {
  const expected = process.env.REGULATORY_GATEWAY_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected) return "missing";
  const authorization = req.header("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!supplied) return "invalid";
  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest) ? "authorized" : "invalid";
}

regulatoryCallbackRouter.post("/licensing/transport/callback", async (req, res, next) => {
  try {
    const authorization = providerCallbackAuthorized(req);
    if (authorization === "missing") {
      return res.status(503).json({ error: "Regulatory callback authorization is not configured." });
    }
    if (authorization === "invalid") {
      return res.status(401).json({ error: "Regulatory callback authorization failed." });
    }
    const input = transportCallbackInput.parse(req.body);
    const current = await currentState();
    const currentStateValue = current.state as CanonicalState;
    const workItems = Array.isArray(currentStateValue.appointmentWorkItems)
      ? (currentStateValue.appointmentWorkItems as Record<string, unknown>[]).map((item) => ({ ...item }))
      : [];
    const item = workItems.find((entry) => String(entry.operationId) === input.operationId);
    if (!item) return res.status(404).json({ error: "Regulatory operation was not found." });
    if (!["SENDING_LIVE", "SUBMITTED_LIVE", "SUBMISSION_UNKNOWN", "CONFIRMED_EXTERNAL"].includes(String(item.status))) {
      return res.status(409).json({ error: "Regulatory operation is not awaiting an external response." });
    }
    const outbox = Array.isArray(currentStateValue.appointmentOutbox)
      ? (currentStateValue.appointmentOutbox as Record<string, unknown>[]).map((entry) => ({ ...entry }))
      : [];
    const outboxEntry = outbox.find((entry) => String(entry.operationId) === input.operationId);
    const priorResponse = (item.transport as Record<string, unknown> | undefined)?.asynchronousResponse as Record<string, unknown> | undefined;
    const lastProviderSequence = Number(outboxEntry?.lastProviderSequence ?? -1);
    const alreadyConfirmed = item.status === "CONFIRMED_EXTERNAL" || priorResponse?.externalConfirmation === true;
    if (alreadyConfirmed && !input.externalConfirmation) {
      return res.json({ accepted: true, duplicate: false, stale: true, operationId: input.operationId });
    }
    if (input.sequence <= lastProviderSequence) {
      return res.json({ accepted: true, duplicate: true, stale: true, operationId: input.operationId });
    }
    if (
      String(item.status) === (input.externalConfirmation ? "CONFIRMED_EXTERNAL" : "SUBMITTED_LIVE")
      && String(priorResponse?.status ?? "") === input.status
      && String(priorResponse?.externalTransactionId ?? "") === String(input.externalTransactionId ?? "")
    ) {
      return res.json({ accepted: true, duplicate: true, operationId: input.operationId });
    }
    const receivedAt = new Date().toISOString();
    const asynchronousResponse = {
      eventId: input.eventId,
      sequence: input.sequence,
      status: input.status,
      receivedAt,
      occurredAt: input.occurredAt ?? null,
      externalConfirmation: input.externalConfirmation,
      externalTransactionId: input.externalTransactionId ?? null,
    };
    const priorStatus = String(item.status);
    item.status = input.externalConfirmation ? "CONFIRMED_EXTERNAL" : "SUBMITTED_LIVE";
    item.updatedAt = receivedAt;
    item.transport = {
      ...((item.transport && typeof item.transport === "object") ? item.transport as Record<string, unknown> : {}),
      asynchronousResponse,
    };
    item.history = [{
      at: receivedAt,
      actor: "regulatory-provider",
      action: input.externalConfirmation ? "EXTERNAL_CONFIRMED" : "EXTERNAL_RESPONSE",
      reason: input.status,
      from: priorStatus,
      to: item.status,
    }, ...(Array.isArray(item.history) ? item.history : [])];
    if (outboxEntry) {
      outboxEntry.status = item.status;
      outboxEntry.updatedAt = receivedAt;
      outboxEntry.asynchronousResponse = asynchronousResponse;
      outboxEntry.lastProviderSequence = Math.max(lastProviderSequence, input.sequence);
      outboxEntry.lastProviderEventId = input.eventId;
    }
    const priorAudit = Array.isArray(currentStateValue.auditLogs) ? currentStateValue.auditLogs as unknown[] : [];
    const audit = appointmentAudit(
      input.externalConfirmation ? "APPOINTMENT_EXTERNAL_CONFIRMED" : "APPOINTMENT_EXTERNAL_RESPONSE",
      {
        workItemId: item.id,
        operationId: input.operationId,
        providerStatus: input.status,
        providerEventId: input.eventId,
        providerSequence: input.sequence,
        externalTransactionId: input.externalTransactionId ?? null,
      },
      String(item.id),
      "regulatory-provider",
      new Date(),
      {
        operationId: input.operationId,
        correlationId: input.operationId,
        status: item.status,
        source: (currentStateValue.regulatoryTransport as Record<string, unknown> | undefined)?.provider ?? "Regulatory gateway callback",
        mode: "live",
        direction: "response",
        externalConfirmation: input.externalConfirmation,
        entityLinks: { producerId: item.producerId, agencyId: item.brokerageId, workItemId: item.id },
      },
    );
    const parsed = stateInput.parse({ ...currentStateValue, appointmentWorkItems: workItems, appointmentOutbox: outbox });
    const nextState = canonicalState(parsed, audit, priorAudit, currentStateValue, "regulatory-provider");
    const updated = await db.update(licensingStateTable).set({
      state: nextState,
      version: sql`${licensingStateTable.version} + 1`,
      updatedAt: new Date(),
      updatedBy: "regulatory-provider",
    }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, current.version))).returning();
    if (!updated[0]) return res.status(409).json({ error: "Regulatory operation changed during reconciliation. Retry the callback." });
    return res.json({ accepted: true, duplicate: false, operationId: input.operationId });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid regulatory callback.", issues: error.issues });
    return next(error);
  }
});

/**
 * Provider-neutral transport boundary. The configured HTTPS gateway is
 * server-owned, so credentials and readiness assertions never reach the
 * browser or the persisted client-editable state.
 */
router.get("/licensing/transport/readiness", async (_req, res, next) => {
  try {
    res.json(await regulatoryReadiness());
  } catch (error) {
    next(error);
  }
});

router.post("/licensing/transport/mode", async (req, res, next) => {
  try {
    const input = transportModeInput.parse(req.body);
    const current = await currentState();
    if (current.version !== input.version) {
      return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(current) });
    }
    const currentStateValue = current.state as CanonicalState;
    const readiness = await regulatoryReadiness();
    if (input.mode === "live" && !readiness.liveActivationAllowed) {
      return res.status(503).json({
        accepted: false,
        mode: "simulation",
        status: "BLOCKED_NOT_READY",
        error: readiness.ready
          ? "Live regulatory transport is blocked until sandbox certification evidence is reviewed."
          : "Live regulatory transport is not configured or verified.",
        readiness,
      });
    }

    const now = new Date();
    const actor = req.userId ?? "unknown";
    const nextTransport = {
      ...readiness,
      mode: input.mode,
      ready: input.mode === "live" && readiness.liveActivationAllowed,
    };
    const managedState = {
      ...currentStateValue,
      licensingMode: input.mode,
      regulatoryTransport: nextTransport,
    };
    const priorAudit = Array.isArray(currentStateValue.auditLogs) ? currentStateValue.auditLogs as unknown[] : [];
    const audit = appointmentAudit("LICENSING_MODE_CHANGED", {
      from: currentStateValue.licensingMode ?? "simulation",
      to: input.mode,
      provider: readiness.provider,
      readiness: readiness.status,
    }, "regulatory-transport", actor, now, {
      operationId: `MODE-${input.mode.toUpperCase()}-${now.getTime()}`,
      status: "Completed",
      source: readiness.provider ?? "Regulatory transport control",
      mode: input.mode,
      direction: "internal",
      provider: readiness.provider,
      readiness: readiness.status,
    });
    const parsed = stateInput.parse(currentStateValue);
    const nextState = canonicalState(parsed, audit, priorAudit, managedState, actor);
    const updated = await db.update(licensingStateTable).set({
      state: nextState,
      version: sql`${licensingStateTable.version} + 1`,
      updatedAt: now,
      updatedBy: actor,
    }).where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, input.version))).returning();
    if (!updated[0]) {
      return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(await currentState()) });
    }
    return res.json({ ...response(updated[0]), readiness: nextTransport });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid regulatory operating mode.", issues: error.issues });
    return next(error);
  }
});

router.post("/licensing/transport/submit", async (req, res, next) => {
  try {
    const input = transportSubmitInput.parse(req.body);
    if (input.mode === "live") {
      return res.status(403).json({
        accepted: false,
        mode: "live",
        operationId: input.operationId,
        status: "WORK_ITEM_REQUIRED",
        error: "Live regulatory requests must use a server-validated appointment work item.",
      });
    }
    const now = new Date().toISOString();
    return res.status(202).json({
      accepted: true,
      simulated: true,
      mode: "simulation",
      operationId: input.operationId,
      acknowledgement: { status: "SIMULATED_ACCEPTED", receivedAt: now },
      asynchronousResponse: { status: "SIMULATED_REVIEW", receivedAt: now, externalConfirmation: false },
      error: null,
      retry: { eligible: true, policy: "operator-reviewed" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid regulatory transport request.", issues: error.issues });
    return next(error);
  }
});

async function updateState(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  try {
    const input = stateUpdateInput.parse(req.body);
    const now = new Date();
    const existing = await currentState();
    const actor = req.userId ?? "unknown";
    const audit = deriveLicensingAudits(existing.state as CanonicalState, input.state, actor, now);
    const priorAudit = Array.isArray((existing.state as CanonicalState).auditLogs)
      ? (existing.state as CanonicalState).auditLogs as unknown[]
      : [];
    const updated = await db.update(licensingStateTable)
      .set({
        state: canonicalState(input.state, audit, priorAudit, existing.state as CanonicalState, actor),
        version: sql`${licensingStateTable.version} + 1`,
        updatedAt: now,
        updatedBy: req.userId ?? "unknown",
      })
      .where(and(eq(licensingStateTable.id, 1), eq(licensingStateTable.version, input.version)))
      .returning();
    if (!updated[0]) {
      return res.status(409).json({ error: "Licensing state was updated by another user.", current: response(await currentState()) });
    }
    return res.json(response(updated[0]));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid licensing state.", issues: error.issues });
    return next(error);
  }
}

router.get("/licensing/seed", async (_req, res, next) => {
  try {
    // Compatibility endpoint for protected consumers; it deliberately reads
    // the same persisted state and never exposes the private source file.
    res.json((await currentState()).state);
  } catch (error) {
    next(error);
  }
});

export default router;