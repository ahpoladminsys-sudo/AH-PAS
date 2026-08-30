import { clerkClient } from "@clerk/express";

const POSITIVE_CACHE_TTL_MS = 60_000;
const positiveAuthorizationCache = new Map<string, number>();
const approvedRoles = new Set(["operations", "admin"]);
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export type AuthorizationFailureCode =
  | "ALLOWLIST_NOT_CONFIGURED"
  | "ALLOWLIST_INVALID"
  | "USER_NOT_AUTHORIZED"
  | "AUTHORIZATION_PROVIDER_UNAVAILABLE";

export type AuthorizationCategory = "configuration" | "authorization";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 | 503,
    public readonly code: AuthorizationFailureCode,
    public readonly category: AuthorizationCategory,
    public readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthorizationConfiguration = {
  configured: boolean;
  valid: boolean;
  status: "configured" | "missing" | "invalid";
  source: "AUTHORIZED_USER_EMAILS";
  message: string;
};

function parseAuthorizedEmails(): { emails: Set<string>; status: AuthorizationConfiguration["status"] } {
  const raw = (process.env.AUTHORIZED_USER_EMAILS ?? "").trim();
  if (!raw) return { emails: new Set(), status: "missing" };
  let entries: string[];
  try {
    const decoded = JSON.parse(raw) as unknown;
    entries = Array.isArray(decoded)
      ? decoded.filter((entry): entry is string => typeof entry === "string")
      : typeof decoded === "string"
        ? decoded.split(/[\s,;]+/)
        : decoded && typeof decoded === "object" && !Array.isArray(decoded)
          ? (() => {
              const record = decoded as Record<string, unknown>;
              const value = record.emails ?? record.authorizedEmails ?? record.authorizedUserEmails;
              return Array.isArray(value)
                ? value.filter((entry): entry is string => typeof entry === "string")
                : typeof value === "string"
                  ? value.split(/[\s,;]+/)
                  : raw.split(/[\s,;]+/);
            })()
          : raw.split(/[\s,;]+/);
    if (Array.isArray(decoded) && entries.length !== decoded.length) {
      return { emails: new Set(), status: "invalid" };
    }
  } catch {
    entries = raw.split(/[\s,;]+/);
  }
  entries = entries.map((entry) => entry.trim().toLocaleLowerCase()).filter(Boolean);
  if (!entries.length || entries.some((entry) => !EMAIL_PATTERN.test(entry))) {
    return { emails: new Set(), status: "invalid" };
  }
  return { emails: new Set(entries), status: "configured" };
}

export function authorizationConfiguration(): AuthorizationConfiguration {
  const { status } = parseAuthorizedEmails();
  if (status === "configured") {
    return {
      configured: true,
      valid: true,
      status,
      source: "AUTHORIZED_USER_EMAILS",
      message: "Workspace authorization is configured.",
    };
  }
  if (status === "invalid") {
    return {
      configured: false,
      valid: false,
      status,
      source: "AUTHORIZED_USER_EMAILS",
      message: "Workspace authorization configuration is invalid. Update the authorized-user setting and retry.",
    };
  }
  return {
    configured: false,
    valid: false,
    status,
    source: "AUTHORIZED_USER_EMAILS",
    message: "Workspace authorization is not configured. An administrator must set the authorized-user setting before cloud access can be used.",
  };
}

function metadataRole(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const role = (metadata as Record<string, unknown>).role;
  return typeof role === "string" ? role.trim().toLocaleLowerCase() : "";
}

export async function authorizeUserId(userId: string): Promise<{ allowed: true }> {
  const parsed = parseAuthorizedEmails();
  if (parsed.status === "missing") {
    throw new AuthorizationError(
      "Workspace authorization is not configured. An administrator must set the authorized-user setting before cloud access can be used.",
      503,
      "ALLOWLIST_NOT_CONFIGURED",
      "configuration",
      true,
    );
  }
  if (parsed.status === "invalid") {
    throw new AuthorizationError(
      "Workspace authorization configuration is invalid. Update the authorized-user setting and retry.",
      503,
      "ALLOWLIST_INVALID",
      "configuration",
      true,
    );
  }
  const allowlist = parsed.emails;
  const cachedUntil = positiveAuthorizationCache.get(userId) ?? 0;
  if (cachedUntil > Date.now()) return { allowed: true };
  positiveAuthorizationCache.delete(userId);

  let user;
  try {
    user = await clerkClient.users.getUser(userId);
  } catch {
    throw new AuthorizationError(
      "Workspace authorization could not be verified right now. Refresh and try again.",
      503,
      "AUTHORIZATION_PROVIDER_UNAVAILABLE",
      "authorization",
      true,
    );
  }
  const hasApprovedEmail = user.emailAddresses.some((email) =>
    email.verification?.status === "verified"
    && allowlist.has(email.emailAddress.trim().toLocaleLowerCase()),
  );
  const hasApprovedRole =
    approvedRoles.has(metadataRole(user.publicMetadata))
    || approvedRoles.has(metadataRole(user.privateMetadata));
  if (!hasApprovedEmail && !hasApprovedRole) {
    throw new AuthorizationError(
      "This signed-in user is not authorized for the workspace.",
      403,
      "USER_NOT_AUTHORIZED",
      "authorization",
      false,
    );
  }
  positiveAuthorizationCache.set(userId, Date.now() + POSITIVE_CACHE_TTL_MS);
  return { allowed: true };
}