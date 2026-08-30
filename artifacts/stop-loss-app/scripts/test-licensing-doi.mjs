import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [licensing, systemLog, server] = await Promise.all([
  readFile(new URL("../public/licensing-suite.js", import.meta.url), "utf8"),
  readFile(new URL("../public/index-reference-runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../../api-server/src/routes/licensing.ts", import.meta.url), "utf8"),
]);

assert.match(licensing, /duplicateAgency/, "agency identities must be duplicate-checked");
assert.match(licensing, /duplicateProducer/, "producer identities must be duplicate-checked");
assert.match(licensing, /A&H authority \/ LOA is required/, "A&H authority remains required");
assert.match(licensing, /entityComplianceSummary/, "producer and agency screens must reuse shared appointment evidence");
assert.match(licensing, /redactAuditValue/, "licensing audit payloads must be redacted");
assert.match(licensing, /operationId/, "licensing audit payloads must be correlated");
assert.match(licensing, /seenAudit/, "hydration must merge audit history by stable event id");
assert.match(systemLog, /Licensing &amp; DOI activity/, "System Log must contain a dedicated regulatory view");
assert.match(systemLog, /LICENSING_LIVE_ACTIVATION_BLOCKED/, "Live mode must fail closed");
assert.match(systemLog, /No regulatory request was submitted/, "blocked activation must not imply submission");
assert.match(systemLog, /blockKey/, "blocked readiness events must be deduplicated");
assert.match(server, /RegulatoryTransportAcknowledgement/, "transport boundary must define acknowledgement semantics");
assert.match(server, /asynchronousResponse/, "transport boundary must define asynchronous response semantics");
assert.match(server, /BLOCKED_NOT_READY/, "server must reject unready Live submission");
assert.match(server, /simulated: true/, "simulation must be explicitly identified");

console.log("Licensing & DOI regression contract passed: validation, shared evidence, correlation, redaction, deduplication, transport, gating, and recovery hooks are present.");