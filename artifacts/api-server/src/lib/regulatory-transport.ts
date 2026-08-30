const REQUIRED_CAPABILITY = "appointment-submission";
const SUPPORTED_PROVIDERS = new Set(["nipr", "state-doi", "ah-pas"]);

export const REGULATORY_TRANSPORT_CONTRACTS = {
  request: "RegulatoryTransportRequest",
  acknowledgement: "RegulatoryTransportAcknowledgement",
  asynchronousResponse: "RegulatoryTransportResponse",
  error: "RegulatoryTransportError",
  retry: "RegulatoryTransportRetry",
  health: "RegulatoryTransportHealth",
} as const;

export type RegulatoryTransportRequest = {
  operationId: string;
  transaction: Record<string, unknown>;
};

export type RegulatoryTransportHealth = {
  mode: "simulation" | "live";
  provider: string | null;
  capability: string;
  configured: boolean;
  authorized: boolean;
  capabilityAuthorized: boolean;
  callbackConfigured: boolean;
  certificationReviewed: boolean;
  liveActivationAllowed: boolean;
  healthy: boolean;
  ready: boolean;
  status: string;
  missing: string[];
  checkedAt: string;
  contracts: typeof REGULATORY_TRANSPORT_CONTRACTS;
};

export type RegulatoryTransportResult = {
  accepted: boolean;
  simulated: false;
  mode: "live";
  operationId: string;
  acknowledgement: {
    status: string;
    receivedAt: string;
    externalTransactionId: string | null;
  } | null;
  asynchronousResponse: {
    status: string;
    receivedAt: string;
    externalConfirmation: boolean;
    externalTransactionId: string | null;
  } | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  retry: {
    eligible: boolean;
    attempts: number;
    maxAttempts: number;
    policy: string;
  };
};

type GatewayResponse = {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
};

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<GatewayResponse>;

type AdapterOptions = {
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  maxAttempts?: number;
  timeoutMs?: number;
  allowInsecure?: boolean;
};

type GatewayConfig = {
  provider: string;
  baseUrl: string;
  token: string;
  capabilities: string[];
  healthPath: string;
  submitPath: string;
  callbackSecret: string;
  certificationReviewed: boolean;
};

const text = (value: unknown, maxLength = 160): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeProvider = (value: unknown): string => text(value, 80).toLocaleLowerCase();

const splitCapabilities = (value: unknown): string[] =>
  text(value, 1000)
    .split(",")
    .map((capability) => capability.trim().toLocaleLowerCase())
    .filter(Boolean);

const booleanEnvironment = (value: unknown): boolean =>
  typeof value === "string" && value.trim().toLocaleLowerCase() === "true";

const pathValue = (value: unknown, fallback: string): string => {
  const path = text(value, 200);
  return path && path.startsWith("/") && !path.includes("://") ? path : fallback;
};

function configurationFromEnvironment(environment: NodeJS.ProcessEnv): GatewayConfig {
  return {
    provider: normalizeProvider(environment.REGULATORY_GATEWAY_PROVIDER),
    baseUrl: text(environment.REGULATORY_GATEWAY_BASE_URL, 500).replace(/\/+$/, ""),
    token: text(environment.REGULATORY_GATEWAY_TOKEN ?? environment.REGULATORY_GATEWAY_API_KEY, 2000),
    capabilities: splitCapabilities(environment.REGULATORY_GATEWAY_CAPABILITIES),
    healthPath: pathValue(environment.REGULATORY_GATEWAY_HEALTH_PATH, "/health"),
    submitPath: pathValue(environment.REGULATORY_GATEWAY_SUBMIT_PATH, "/appointments"),
    callbackSecret: text(environment.REGULATORY_GATEWAY_WEBHOOK_SECRET, 2000),
    certificationReviewed: booleanEnvironment(environment.REGULATORY_GATEWAY_CERTIFICATION_REVIEWED),
  };
}

function safeUrl(config: GatewayConfig, path: string, allowInsecure: boolean): URL | null {
  try {
    const url = new URL(`${config.baseUrl}${path}`);
    if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) return null;
    return url;
  } catch {
    return null;
  }
}

const responseBody = async (response: GatewayResponse): Promise<Record<string, unknown>> => {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const responseValue = (body: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = text(body[key], 200);
    if (value) return value;
  }
  return null;
};

const retryableStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500;

export class HttpRegulatoryGatewayAdapter {
  private readonly config: GatewayConfig;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly allowInsecure: boolean;

  constructor(
    environment: NodeJS.ProcessEnv = process.env,
    options: AdapterOptions = {},
  ) {
    this.config = configurationFromEnvironment(environment);
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = Math.min(Math.max(options.maxAttempts ?? 3, 1), 5);
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5000, 500), 15000);
    this.allowInsecure = options.allowInsecure ?? false;
  }

  private configured(): boolean {
    return Boolean(
      this.config.provider
      && SUPPORTED_PROVIDERS.has(this.config.provider)
      && this.config.baseUrl
      && this.config.token
      && this.config.callbackSecret
      && safeUrl(this.config, this.config.healthPath, this.allowInsecure),
    );
  }

  private authorizationHeaders(operationId?: string): Record<string, string> {
    return {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${this.config.token}`,
      ...(operationId ? { "x-correlation-id": operationId, "x-idempotency-key": operationId } : {}),
    };
  }

  private async request(path: string, init: { method: string; body?: string; operationId?: string }): Promise<GatewayResponse> {
    const url = safeUrl(this.config, path, this.allowInsecure);
    if (!url) throw new Error("Gateway URL is not configured for a trusted HTTPS connection.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url.toString(), {
        method: init.method,
        headers: this.authorizationHeaders(init.operationId),
        ...(init.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async readiness(): Promise<RegulatoryTransportHealth> {
    const checkedAt = this.now().toISOString();
    const missing: string[] = [];
    const configured = this.configured();
    const supportedProvider = SUPPORTED_PROVIDERS.has(this.config.provider);
    const capabilitySupported = this.config.capabilities.includes(REQUIRED_CAPABILITY);
    let capabilityAuthorized = false;
    if (!this.config.provider || !supportedProvider) missing.push("supported provider");
    if (!this.config.baseUrl || !safeUrl(this.config, this.config.healthPath, this.allowInsecure)) missing.push("HTTPS gateway URL");
    if (!this.config.token) missing.push("authorization");
    if (!this.config.callbackSecret) missing.push("callback authorization");
    if (!capabilitySupported) missing.push("supported capability");
    if (!configured || missing.length) {
      return {
        mode: "simulation",
        provider: supportedProvider ? this.config.provider : null,
        capability: REQUIRED_CAPABILITY,
        configured,
        authorized: false,
        capabilityAuthorized,
        callbackConfigured: Boolean(this.config.callbackSecret),
        certificationReviewed: this.config.certificationReviewed,
        liveActivationAllowed: false,
        healthy: false,
        ready: false,
        status: !this.config.provider && !this.config.baseUrl && !this.config.token
          ? "NOT_CONFIGURED"
          : "CONFIGURATION_INCOMPLETE",
        missing: Array.from(new Set(missing)),
        checkedAt,
        contracts: REGULATORY_TRANSPORT_CONTRACTS,
      };
    }

    let authorized = false;
    let healthy = false;
    let status = "HEALTH_CHECK_FAILED";
    try {
      const response = await this.request(this.config.healthPath, { method: "GET" });
      const body = await responseBody(response);
      // A public 200 health endpoint proves reachability, not authorization.
      // The provider must explicitly assert that this credential is authorized.
      authorized = response.ok && body.authorized === true;
      // The configured capability list is an allow-list, not proof that the
      // provider granted this credential permission to submit appointments.
      // Require an explicit provider capability assertion as well.
      const authorizedCapabilities = Array.isArray(body.authorizedCapabilities)
        ? body.authorizedCapabilities.map((value) => text(value, 100).toLocaleLowerCase())
        : [];
      const capabilityMap = body.capabilities && typeof body.capabilities === "object" && !Array.isArray(body.capabilities)
        ? (body.capabilities as Record<string, unknown>)
        : null;
      capabilityAuthorized = response.ok && Boolean(
        body.capabilityAuthorized === true
        || body.appointmentSubmissionAuthorized === true
        || authorizedCapabilities.includes(REQUIRED_CAPABILITY)
        || capabilityMap?.[REQUIRED_CAPABILITY] === true
        || (capabilityMap?.[REQUIRED_CAPABILITY] && typeof capabilityMap[REQUIRED_CAPABILITY] === "object"
          && (capabilityMap[REQUIRED_CAPABILITY] as Record<string, unknown>).authorized === true)
      );
      healthy = response.ok && body.healthy !== false;
      status = response.status === 401 || response.status === 403
        ? "AUTHORIZATION_REQUIRED"
        : response.ok && healthy
          ? "READY"
          : "HEALTH_CHECK_FAILED";
    } catch {
      status = "HEALTH_CHECK_FAILED";
    }
    if (!authorized) missing.push("authorization");
    if (!capabilityAuthorized) missing.push("authorized appointment-submission capability");
    if (!healthy) missing.push("healthy connection");
    const ready = configured && capabilitySupported && authorized && capabilityAuthorized && healthy;
    const liveActivationAllowed = ready && this.config.certificationReviewed;
    if (ready && !this.config.certificationReviewed) status = "CERTIFICATION_REVIEW_REQUIRED";
    return {
      mode: liveActivationAllowed ? "live" : "simulation",
      provider: this.config.provider,
      capability: REQUIRED_CAPABILITY,
      configured,
      authorized,
      capabilityAuthorized,
      callbackConfigured: Boolean(this.config.callbackSecret),
      certificationReviewed: this.config.certificationReviewed,
      liveActivationAllowed,
      healthy,
      ready,
      status: liveActivationAllowed ? "READY" : status,
      missing: Array.from(new Set(missing)),
      checkedAt,
      contracts: REGULATORY_TRANSPORT_CONTRACTS,
    };
  }

  async submit(request: RegulatoryTransportRequest): Promise<RegulatoryTransportResult> {
    const readiness = await this.readiness();
    if (!readiness.liveActivationAllowed) {
      const certificationBlocked = readiness.ready && !readiness.certificationReviewed;
      return {
        accepted: false,
        simulated: false,
        mode: "live",
        operationId: request.operationId,
        acknowledgement: null,
        asynchronousResponse: null,
        error: {
          code: certificationBlocked ? "BLOCKED_CERTIFICATION_REVIEW_REQUIRED" : "BLOCKED_NOT_READY",
          message: certificationBlocked
            ? "Live regulatory transport is blocked until sandbox certification evidence is reviewed."
            : "Live regulatory transport is not configured or verified.",
          retryable: false,
        },
        retry: { eligible: false, attempts: 0, maxAttempts: this.maxAttempts, policy: "server-readiness-gated" },
      };
    }

    let attempts = 0;
    for (; attempts < this.maxAttempts; attempts += 1) {
      try {
        const response = await this.request(this.config.submitPath, {
          method: "POST",
          operationId: request.operationId,
          body: JSON.stringify({
            schema: "tinubu.regulatory-transport-request.v1",
            operationId: request.operationId,
            correlationId: request.operationId,
            transaction: request.transaction,
          }),
        });
        const body = await responseBody(response);
        const externalTransactionId = responseValue(body, ["externalTransactionId", "transactionId", "confirmationId", "id"]);
        const providerStatus = responseValue(body, ["status", "state"]) ?? (response.status === 202 ? "ACCEPTED" : "COMPLETED");
        if (response.ok) {
          const receivedAt = this.now().toISOString();
          return {
            accepted: true,
            simulated: false,
            mode: "live",
            operationId: request.operationId,
            acknowledgement: { status: response.status === 202 ? "EXTERNAL_ACCEPTED" : "EXTERNAL_COMPLETED", receivedAt, externalTransactionId },
            asynchronousResponse: {
              status: providerStatus,
              receivedAt,
              // HTTP acceptance is not confirmation. Only an explicit provider
              // assertion can set externalConfirmation.
              externalConfirmation: body.externalConfirmation === true,
              externalTransactionId,
            },
            error: null,
            retry: { eligible: false, attempts: attempts + 1, maxAttempts: this.maxAttempts, policy: "idempotent-correlation-key" },
          };
        }
        const canRetry = retryableStatus(response.status);
        if (!canRetry || attempts + 1 >= this.maxAttempts) {
          return {
            accepted: false,
            simulated: false,
            mode: "live",
            operationId: request.operationId,
            acknowledgement: null,
            asynchronousResponse: null,
            error: {
              code: `PROVIDER_HTTP_${response.status}`,
              message: "The regulatory provider rejected the request.",
              retryable: canRetry,
            },
            retry: { eligible: canRetry, attempts: attempts + 1, maxAttempts: this.maxAttempts, policy: "idempotent-correlation-key" },
          };
        }
      } catch {
        if (attempts + 1 >= this.maxAttempts) {
          return {
            accepted: false,
            simulated: false,
            mode: "live",
            operationId: request.operationId,
            acknowledgement: null,
            asynchronousResponse: null,
            error: { code: "PROVIDER_NETWORK_ERROR", message: "The regulatory provider could not be reached.", retryable: true },
            retry: { eligible: true, attempts: attempts + 1, maxAttempts: this.maxAttempts, policy: "idempotent-correlation-key" },
          };
        }
      }
      await this.sleep(25 * (attempts + 1));
    }

    return {
      accepted: false,
      simulated: false,
      mode: "live",
      operationId: request.operationId,
      acknowledgement: null,
      asynchronousResponse: null,
      error: { code: "PROVIDER_RETRY_EXHAUSTED", message: "The regulatory provider did not accept the request after retries.", retryable: true },
      retry: { eligible: true, attempts, maxAttempts: this.maxAttempts, policy: "idempotent-correlation-key" },
    };
  }
}

export function createRegulatoryGatewayAdapter(
  environment: NodeJS.ProcessEnv = process.env,
  options: AdapterOptions = {},
): HttpRegulatoryGatewayAdapter {
  return new HttpRegulatoryGatewayAdapter(environment, options);
}