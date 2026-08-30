function redact(value: unknown, key = ""): unknown {
  if (/email|phone|ein|npn|license(number)?|ssn|token|secret|password|credential/i.test(key) && value != null && typeof value !== "object") {
    const raw = String(value);
    return raw.length <= 4 ? "••••" : `••••${raw.slice(-4)}`;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  if (typeof value === "string") return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, "[redacted-id]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]")
    .replace(/\b\d{7,}\b/g, "[redacted-number]");
  return value;
}

const records = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];

export function deriveLicensingAudits(previous: Record<string, unknown>, next: Record<string, unknown>, actor: string, now = new Date()) {
  const events: Record<string, unknown>[] = [];
  const groups = [
    { key: "brokerages", entity: "AGENCY" },
    { key: "agents", entity: "PRODUCER" },
    { key: "stateLicenses", entity: "LICENSE" },
    { key: "appointmentEvaluations", entity: "EVALUATION" },
  ];
  groups.forEach(({ key, entity }) => {
    const beforeById = new Map(records(previous[key]).map((item) => [String(item.id ?? ""), item]));
    const afterById = new Map(records(next[key]).map((item) => [String(item.id ?? ""), item]));
    const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
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
        after: redact(after ?? null),
      });
    });
  });
  return events;
}

export function mergeServerAudits(generated: Record<string, unknown>[], prior: unknown[]) {
  return [...generated, ...prior].filter(Boolean).filter((entry, index, list) => {
    const id = String((entry as Record<string, unknown>).id ?? "");
    return id ? list.findIndex((candidate) => String((candidate as Record<string, unknown>).id ?? "") === id) === index : true;
  }).slice(0, 500);
}