// test/licensing-audit.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/lib/licensing-audit.ts
function redact(value, key = "") {
  if (/email|phone|ein|npn|license(number)?|ssn|token|secret|password|credential/i.test(key) && value != null && typeof value !== "object") {
    const raw = String(value);
    return raw.length <= 4 ? "\u2022\u2022\u2022\u2022" : `\u2022\u2022\u2022\u2022${raw.slice(-4)}`;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  if (typeof value === "string") return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]").replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[redacted-id]").replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]").replace(/\b\d{7,}\b/g, "[redacted-number]");
  return value;
}
var records = (value) => Array.isArray(value) ? value.filter((item) => !!item && typeof item === "object") : [];
function deriveLicensingAudits(previous, next, actor, now = /* @__PURE__ */ new Date()) {
  const events = [];
  const groups = [
    { key: "brokerages", entity: "AGENCY" },
    { key: "agents", entity: "PRODUCER" },
    { key: "stateLicenses", entity: "LICENSE" },
    { key: "appointmentEvaluations", entity: "EVALUATION" }
  ];
  groups.forEach(({ key, entity }) => {
    const beforeById = new Map(records(previous[key]).map((item) => [String(item.id ?? ""), item]));
    const afterById = new Map(records(next[key]).map((item) => [String(item.id ?? ""), item]));
    const ids = /* @__PURE__ */ new Set([...beforeById.keys(), ...afterById.keys()]);
    ids.forEach((id) => {
      if (!id) return;
      const before = beforeById.get(id);
      const after = afterById.get(id);
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const verb = !before ? "CREATED" : !after ? "DELETED" : "UPDATED";
      const operationId = `OP-${now.getTime()}-${entity}-${id}`;
      const jurisdiction = String(after?.state ?? before?.state ?? "") || null;
      const producerId = after?.agentId ?? after?.producerId ?? before?.agentId ?? before?.producerId ?? (entity === "PRODUCER" ? id : null);
      const agencyId = after?.brokerageId ?? before?.brokerageId ?? (entity === "AGENCY" ? id : null);
      events.push({
        id: `A-server-${now.getTime()}-${entity}-${id}`,
        timestamp: now.toISOString(),
        action: `${entity}_${verb}`,
        details: `${entity.toLowerCase()} ${verb.toLowerCase()} through validated licensing state mutation.`,
        entityId: id,
        updatedBy: actor,
        category: "Licensing & DOI",
        eventType: `${entity}_${verb}`,
        status: "Completed",
        source: "Protected licensing API",
        mode: "simulation",
        direction: "internal",
        operationId,
        correlationId: operationId,
        jurisdiction,
        entityLinks: { entityId: id, producerId, agencyId },
        metadata: { operationId, correlationId: operationId, jurisdiction, entityId: id, producerId, agencyId },
        before: redact(before ?? null),
        after: redact(after ?? null)
      });
    });
  });
  return events;
}
function mergeServerAudits(generated, prior) {
  return [...generated, ...prior].filter(Boolean).filter((entry, index, list) => {
    const id = String(entry.id ?? "");
    return id ? list.findIndex((candidate) => String(candidate.id ?? "") === id) === index : true;
  }).slice(0, 500);
}

// test/licensing-audit.test.ts
test("forged browser audit is ignored while server derives durable mutation evidence", () => {
  const previous = { brokerages: [{ id: "B-1", name: "Agency", npn: "1234567" }], auditLogs: [{ id: "FORGED", action: "DOI_APPROVED" }] };
  const next = { brokerages: [{ id: "B-1", name: "Updated Agency", npn: "1234567" }], auditLogs: [{ id: "FORGED-2", action: "DOI_SUBMITTED" }] };
  const generated = deriveLicensingAudits(previous, next, "server-user", /* @__PURE__ */ new Date("2026-08-30T12:00:00Z"));
  const persisted = mergeServerAudits(generated, []);
  assert.equal(persisted.length, 1);
  assert.equal(persisted.some((entry) => entry.id === "FORGED-2"), false);
  const event = persisted[0];
  assert.equal(event.action, "AGENCY_UPDATED");
  assert.equal(event.updatedBy, "server-user");
  assert.equal(event.category, "Licensing & DOI");
  assert.match(String(event.operationId), /^OP-/);
  assert.doesNotMatch(JSON.stringify(event), /1234567/);
});
test("server-generated events survive merge without duplication", () => {
  const event = deriveLicensingAudits({ agents: [] }, { agents: [{ id: "P-1", name: "Producer" }] }, "server-user", /* @__PURE__ */ new Date("2026-08-30T12:00:00Z"))[0];
  const merged = mergeServerAudits([event], [event]);
  assert.equal(merged.length, 1);
});
