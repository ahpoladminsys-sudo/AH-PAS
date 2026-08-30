import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import geminiRouter from "../src/routes/gemini.ts";

const validGuidance = {
  recordedEvidence: ["The event status is Failed."],
  likelyCauses: ["A service configuration issue may have caused the recorded failure."],
  repairActions: ["Review the named service configuration with an authorized operator."],
  verificationSteps: ["Repeat the normal status check and confirm a successful event is recorded."],
  advisory: "Provider advisory text is replaced by the server.",
};

let providerCalls = 0;
let lastProviderRequest;
globalThis.__geminiRepairSummaryGenerate = async (request) => {
  providerCalls += 1;
  lastProviderRequest = request;
  return { text: JSON.stringify(validGuidance) };
};

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use((req, res, next) => {
  const userId = req.header("x-test-user");
  if (!userId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  req.userId = userId;
  next();
});
app.use(geminiRouter);

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
test.after(() => server.close());

function event(overrides = {}) {
  return {
    eventId: "SYS-test-1",
    timestamp: "2026-08-30T12:00:00.000Z",
    category: "Cloud",
    action: "CLOUD_SYNC_FAILED",
    status: "Failed",
    detail: "Cloud synchronization failed.",
    actorSource: "Cloud workspace controls",
    operationId: "operation-test-1",
    metadata: { source: "System Log push", service: "drive", code: "PROVIDER_ERROR" },
    ...overrides,
  };
}

async function request(body, userId = "repair-test-user") {
  const response = await fetch(`${baseUrl}/gemini/repair-summary`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("repair summaries remain protected", async () => {
  const response = await request({ event: event() }, "");
  assert.equal(response.status, 401);
  assert.match(response.body.error, /authentication/i);
});

test("successful events do not invoke repair guidance", async () => {
  const before = providerCalls;
  const response = await request({ event: event({ status: "Completed" }) }, "successful-event-user");
  assert.equal(response.status, 400);
  assert.equal(response.body.code, "REPAIR_SUMMARY_NOT_APPLICABLE");
  assert.equal(providerCalls, before);
});

test("repair input is bounded", async () => {
  const longDetail = await request({ event: event({ detail: "x".repeat(2001) }) }, "long-detail-user");
  assert.equal(longDetail.status, 400);

  const metadata = {};
  for (let index = 0; index < 13; index += 1) metadata[`field${index}`] = "value";
  const tooManyMetadata = await request({ event: event({ metadata }) }, "metadata-limit-user");
  assert.equal(tooManyMetadata.status, 400);
});

test("only safe metadata and redacted text reach the provider", async () => {
  const response = await request({
    event: event({
      detail: "Authorization: Bearer super-secret-value",
      actorSource: "token=private-actor-token",
      operationId: "secret=private-operation-secret",
      metadata: {
        source: "System Log push",
        code: "PROVIDER_ERROR",
        token: "private-token-value",
        responsePayload: "private-response-value",
      },
    }),
  }, "redaction-user");
  assert.equal(response.status, 200);
  assert.match(response.body.advisory, /no repair or other action was performed/i);
  const prompt = lastProviderRequest.contents[0].parts[0].text;
  assert.match(prompt, /PROVIDER_ERROR/);
  assert.doesNotMatch(prompt, /super-secret-value|private-actor-token|private-operation-secret|private-token-value|private-response-value/);
});

test("provider failures return a truthful retryable error", async () => {
  globalThis.__geminiRepairSummaryGenerate = async () => {
    throw new Error("provider private failure");
  };
  const response = await request({ event: event() }, "provider-failure-user");
  assert.equal(response.status, 502);
  assert.equal(response.body.code, "AI_PROVIDER_UNAVAILABLE");
  assert.doesNotMatch(response.body.error, /private failure/i);
  globalThis.__geminiRepairSummaryGenerate = async (providerRequest) => {
    providerCalls += 1;
    lastProviderRequest = providerRequest;
    return { text: JSON.stringify(validGuidance) };
  };
});

test("repair summaries are rate limited per user", async () => {
  for (let count = 0; count < 8; count += 1) {
    const response = await request({ event: event({ eventId: `SYS-rate-${count}` }) }, "rate-limit-user");
    assert.equal(response.status, 200);
  }
  const limited = await request({ event: event({ eventId: "SYS-rate-limited" }) }, "rate-limit-user");
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "RATE_LIMITED");
});