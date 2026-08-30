import assert from "node:assert/strict";
import test from "node:test";
import { deriveLicensingAudits, mergeServerAudits } from "../src/lib/licensing-audit.js";

test("forged browser audit is ignored while server derives durable mutation evidence", () => {
  const previous = { brokerages: [{ id: "B-1", name: "Agency", npn: "1234567" }], auditLogs: [{ id: "FORGED", action: "DOI_APPROVED" }] };
  const next = { brokerages: [{ id: "B-1", name: "Updated Agency", npn: "1234567" }], auditLogs: [{ id: "FORGED-2", action: "DOI_SUBMITTED" }] };
  const generated = deriveLicensingAudits(previous, next, "server-user", new Date("2026-08-30T12:00:00Z"));
  const persisted = mergeServerAudits(generated, []);
  assert.equal(persisted.length, 1);
  assert.equal(persisted.some((entry) => (entry as Record<string, unknown>).id === "FORGED-2"), false);
  const event = persisted[0] as Record<string, unknown>;
  assert.equal(event.action, "AGENCY_UPDATED");
  assert.equal(event.updatedBy, "server-user");
  assert.equal(event.category, "Licensing & DOI");
  assert.match(String(event.operationId), /^OP-/);
  assert.doesNotMatch(JSON.stringify(event), /1234567/);
});

test("server-generated events survive merge without duplication", () => {
  const event = deriveLicensingAudits({ agents: [] }, { agents: [{ id: "P-1", name: "Producer" }] }, "server-user", new Date("2026-08-30T12:00:00Z"))[0];
  const merged = mergeServerAudits([event], [event]);
  assert.equal(merged.length, 1);
});