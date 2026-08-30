import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpRegulatoryGatewayAdapter,
  REGULATORY_TRANSPORT_CONTRACTS,
} from "../src/lib/regulatory-transport.js";

const environment = {
  REGULATORY_GATEWAY_PROVIDER: "nipr",
  REGULATORY_GATEWAY_BASE_URL: "http://gateway.test",
  REGULATORY_GATEWAY_TOKEN: "sandbox-secret-token",
  REGULATORY_GATEWAY_CAPABILITIES: "appointment-submission",
  REGULATORY_GATEWAY_WEBHOOK_SECRET: "sandbox-webhook-secret",
  REGULATORY_GATEWAY_CERTIFICATION_REVIEWED: "true",
};

const response = (status: number, body: Record<string, unknown>) => ({
  status,
  ok: status >= 200 && status < 300,
  async json() {
    return body;
  },
});

test("readiness fails closed when gateway configuration is missing", async () => {
  const adapter = new HttpRegulatoryGatewayAdapter({});
  const readiness = await adapter.readiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.mode, "simulation");
  assert.equal(readiness.status, "NOT_CONFIGURED");
  assert.deepEqual(readiness.contracts, REGULATORY_TRANSPORT_CONTRACTS);
  assert.equal(readiness.missing.includes("authorization"), true);
});

test("sandbox submission preserves correlation and never echoes credentials or transaction PII", async () => {
  const calls: Array<{ input: string; init: Record<string, unknown> }> = [];
  const replies = [
    response(200, { healthy: true, authorized: true, authorizedCapabilities: ["appointment-submission"] }),
    response(202, { status: "QUEUED", externalTransactionId: "EXT-123" }),
  ];
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    now: () => new Date("2026-08-30T12:00:00.000Z"),
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return replies.shift()!;
    },
  });
  const result = await adapter.submit({
    operationId: "OP-CERT-1",
    transaction: {
      producerNpn: "123456789",
      email: "producer@example.com",
      credential: "must-not-return",
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.operationId, "OP-CERT-1");
  assert.equal(result.acknowledgement?.externalTransactionId, "EXT-123");
  assert.equal(result.asynchronousResponse?.externalConfirmation, false);
  assert.equal(calls[1].init.headers && (calls[1].init.headers as Record<string, string>)["x-correlation-id"], "OP-CERT-1");
  assert.equal(calls[1].init.headers && (calls[1].init.headers as Record<string, string>)["x-idempotency-key"], "OP-CERT-1");
  assert.match(String(calls[1].init.body), /"correlationId":"OP-CERT-1"/);
  assert.doesNotMatch(JSON.stringify(result), /sandbox-secret-token|123456789|producer@example\.com|must-not-return/);
});

test("transient provider failures retry with the same idempotent operation correlation", async () => {
  const submissionHeaders: Record<string, string>[] = [];
  const submissionBodies: string[] = [];
  let requestNumber = 0;
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    sleep: async () => undefined,
    fetchImpl: async (_input, init) => {
      requestNumber += 1;
       if (requestNumber === 1) return response(200, { healthy: true, authorized: true, authorizedCapabilities: ["appointment-submission"] });
      submissionHeaders.push(init.headers);
      submissionBodies.push(String(init.body));
      if (requestNumber === 2) return response(503, { status: "TEMPORARY_FAILURE" });
      return response(202, { status: "QUEUED", externalTransactionId: "EXT-RETRY" });
    },
  });
  const result = await adapter.submit({ operationId: "OP-RETRY-1", transaction: { workItemId: "AW-1" } });

  assert.equal(result.accepted, true);
  assert.equal(result.retry.attempts, 2);
  assert.equal(submissionHeaders.length, 2);
  assert.equal(submissionHeaders.every((headers) => headers["x-idempotency-key"] === "OP-RETRY-1"), true);
  assert.equal(submissionBodies[0], submissionBodies[1]);
});

test("external confirmation is true only when explicitly asserted by the provider", async () => {
  const replies = [
    response(200, { healthy: true, authorized: true, authorizedCapabilities: ["appointment-submission"] }),
    response(200, { status: "CONFIRMED", confirmationId: "CONF-1", externalConfirmation: true }),
  ];
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    fetchImpl: async () => replies.shift()!,
  });
  const result = await adapter.submit({ operationId: "OP-CONFIRM-1", transaction: { workItemId: "AW-2" } });
  assert.equal(result.accepted, true);
  assert.equal(result.asynchronousResponse?.externalConfirmation, true);
  assert.equal(result.asynchronousResponse?.externalTransactionId, "CONF-1");
});

test("authorization failure prevents Live readiness and submission", async () => {
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    fetchImpl: async () => response(401, { authorized: false, healthy: false, authorizedCapabilities: [] }),
  });
  const readiness = await adapter.readiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.authorized, false);
  assert.equal(readiness.status, "AUTHORIZATION_REQUIRED");
  assert.equal(readiness.missing.includes("authorization"), true);
});

test("a public healthy endpoint cannot be mistaken for authorization", async () => {
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    fetchImpl: async () => response(200, { healthy: true }),
  });
  const readiness = await adapter.readiness();
  assert.equal(readiness.healthy, true);
  assert.equal(readiness.authorized, false);
  assert.equal(readiness.capabilityAuthorized, false);
  assert.equal(readiness.ready, false);
});

test("provider health must explicitly authorize appointment submission", async () => {
  const adapter = new HttpRegulatoryGatewayAdapter(environment, {
    allowInsecure: true,
    fetchImpl: async () => response(200, {
      healthy: true,
      authorized: true,
      capabilities: ["appointment-submission"],
    }),
  });
  const readiness = await adapter.readiness();
  assert.equal(readiness.authorized, true);
  assert.equal(readiness.capabilityAuthorized, false);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.missing.includes("authorized appointment-submission capability"), true);
});

test("provider readiness cannot activate Live until certification evidence is reviewed", async () => {
  const methods: string[] = [];
  const adapter = new HttpRegulatoryGatewayAdapter(
    { ...environment, REGULATORY_GATEWAY_CERTIFICATION_REVIEWED: "false" },
    {
      allowInsecure: true,
      fetchImpl: async (_input, init) => {
        methods.push(init.method);
        return response(200, {
          healthy: true,
          authorized: true,
          authorizedCapabilities: ["appointment-submission"],
        });
      },
    },
  );
  const readiness = await adapter.readiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.certificationReviewed, false);
  assert.equal(readiness.liveActivationAllowed, false);
  assert.equal(readiness.mode, "simulation");
  assert.equal(readiness.status, "CERTIFICATION_REVIEW_REQUIRED");

  const result = await adapter.submit({
    operationId: "OP-UNREVIEWED-1",
    transaction: { workItemId: "AW-UNREVIEWED-1" },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.error?.code, "BLOCKED_CERTIFICATION_REVIEW_REQUIRED");
  assert.deepEqual(methods, ["GET", "GET"]);
});