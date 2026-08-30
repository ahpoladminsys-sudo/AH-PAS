import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetApplicationAccessStatusResponse,
  HealthCheckResponse,
} from "@workspace/api-zod";
import {
  AuthorizationError,
  authorizationConfiguration,
  authorizeUserId,
} from "../lib/user-authorization";
import {
  PORTABLE_SESSION_HEADER,
  inspectPortableSessionToken,
} from "../lib/portable-auth";

const router: IRouter = Router();
const GITHUB_REPOSITORY = "ahpoladminsys-sudo/AH-PAS";
const GITHUB_DEFAULT_BRANCH = "main";

function sessionUserId(req: Parameters<typeof getAuth>[0]): string | null {
  const auth = getAuth(req);
  const claimUserId = auth?.sessionClaims?.userId;
  return typeof claimUserId === "string" ? claimUserId : auth?.userId ?? null;
}

function providerFromUser(user: unknown): "github" | "other" | "unknown" {
  if (!user || typeof user !== "object") return "unknown";
  const accounts = (user as { externalAccounts?: unknown }).externalAccounts;
  if (!Array.isArray(accounts)) return "unknown";
  const hasGithub = accounts.some((account) => {
    if (!account || typeof account !== "object") return false;
    const record = account as Record<string, unknown>;
    return [record.provider, record.providerId, record.verificationStrategy]
      .some((value) => typeof value === "string" && /github/i.test(value));
  });
  return hasGithub ? "github" : accounts.length ? "other" : "unknown";
}

async function repositoryConnectionStatus(): Promise<{
  repository: typeof GITHUB_REPOSITORY;
  status: "connected" | "not_connected" | "unavailable";
  defaultBranch?: string;
  historyStatus?: "available" | "empty" | "unknown";
  message: string;
}> {
  try {
    const response = await new ReplitConnectors().proxy(
      "github",
      `/repos/${GITHUB_REPOSITORY}`,
      { method: "GET" },
    );
    const repository = response.ok ? await response.json() : null;
    return classifyRepositoryConnection(response.status, repository);
  } catch {
    return {
      repository: GITHUB_REPOSITORY,
      status: "unavailable",
      message:
        "GitHub repository verification is temporarily unavailable. Refresh the protected status or reconnect source control.",
    };
  }
}

export function classifyRepositoryConnection(
  httpStatus: number,
  repository: unknown,
): Awaited<ReturnType<typeof repositoryConnectionStatus>> {
  if (httpStatus === 404) {
    return {
      repository: GITHUB_REPOSITORY,
      status: "not_connected",
      message:
        "The approved GitHub connection cannot access the target repository. Reconnect source control with repository access.",
    };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      repository: GITHUB_REPOSITORY,
      status: "unavailable",
      message:
        "GitHub repository verification is temporarily unavailable. Refresh the protected status or reconnect source control.",
    };
  }
  const record =
    repository && typeof repository === "object"
      ? repository as Record<string, unknown>
      : {};
  const permissions =
    record.permissions && typeof record.permissions === "object"
      ? record.permissions as Record<string, unknown>
      : {};
  if (
    record.full_name !== GITHUB_REPOSITORY
    || record.private !== false
    || record.visibility !== "public"
    || permissions.push !== true
    || record.default_branch !== GITHUB_DEFAULT_BRANCH
  ) {
    return {
      repository: GITHUB_REPOSITORY,
      status: "not_connected",
      message:
        "The approved GitHub connection did not verify the requested public, writable repository with main as its default branch.",
    };
  }
  const historyStatus =
    typeof record.size === "number"
      ? record.size === 0 ? "empty" : "available"
      : "unknown";
  return {
    repository: GITHUB_REPOSITORY,
    status: "connected",
    defaultBranch: GITHUB_DEFAULT_BRANCH,
    historyStatus,
    message:
      historyStatus === "empty"
        ? "The approved GitHub connection can access this repository. Its default branch is main; the repository has no initial commit history yet."
        : "The approved GitHub connection can access this repository. Its default branch is main.",
  };
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Deliberately exposes only state, not the configured operator addresses.
router.get("/auth/status", (_req, res) => {
  res.json(authorizationConfiguration());
});

// This endpoint is intentionally redacted. It reports only the state needed by
// the public workspace shell to explain access and recovery; it never returns
// an email, provider token, Clerk object, or repository credential.
router.get("/auth/access-status", async (req, res) => {
  const portableToken = req.header(PORTABLE_SESSION_HEADER);
  const portableInspection = inspectPortableSessionToken(portableToken);
  const userId = portableInspection.claims?.userId || sessionUserId(req);
  const mode = portableToken ? "portable" : "hosted";
  const sessionStatus = portableToken && !portableInspection.claims
    ? portableInspection.reason === "expired" ? "expired" : "invalid"
    : userId ? "connected" : "required";
  const sessionMessage = sessionStatus === "connected"
    ? mode === "portable" ? "Short-lived downloaded-workspace session is active." : "Hosted application session is active."
    : sessionStatus === "expired"
      ? "The short-lived downloaded-workspace session has expired. Reconnect to continue."
      : sessionStatus === "invalid"
        ? "The downloaded-workspace session is invalid. Reconnect to continue."
        : "Sign in through the secure application handoff to continue.";

  const authorization = authorizationConfiguration();
  let authorizationState: {
    status: "authorized" | "required" | "denied" | "unavailable" | "not_configured";
    code?: string;
    message: string;
  } = {
    status: authorization.status === "configured" ? "required" : "not_configured",
    code: authorization.status === "configured"
      ? "SESSION_REQUIRED"
      : `ALLOWLIST_${authorization.status === "invalid" ? "INVALID" : "NOT_CONFIGURED"}`,
    message: authorization.message,
  };
  let identityProvider: {
    status: "github" | "other" | "unknown" | "unavailable";
    message: string;
  } = {
    status: "unknown",
    message: userId ? "The signed-in provider is being verified by Clerk." : "Sign in to identify the application provider.",
  };

  if (userId && authorization.status === "configured") {
    try {
      await authorizeUserId(userId);
      authorizationState = {
        status: "authorized",
        message: "Signed-in user is authorized for protected workspace services.",
      };
    } catch (error) {
      if (error instanceof AuthorizationError) {
        authorizationState = {
          status: error.code === "USER_NOT_AUTHORIZED" ? "denied" : "unavailable",
          code: error.code,
          message: error.message,
        };
      } else {
        authorizationState = {
          status: "unavailable",
          code: "AUTHORIZATION_PROVIDER_UNAVAILABLE",
          message: "Workspace authorization could not be verified right now. Refresh and try again.",
        };
      }
    }
  }

  if (userId) {
    try {
      const user = await clerkClient.users.getUser(userId);
      const provider = providerFromUser(user);
      identityProvider = {
        status: provider,
        message: provider === "github"
          ? "GitHub sign-in is verified through the Clerk application session."
          : provider === "other"
            ? "A non-GitHub Clerk sign-in provider is active."
            : "Clerk session is active; the provider could not be identified.",
      };
    } catch {
      identityProvider = {
        status: "unavailable",
        message: "The sign-in provider could not be verified right now. Refresh and try again.",
      };
    }
  }

  const repository =
    sessionStatus === "connected" && authorizationState.status === "authorized"
      ? await repositoryConnectionStatus()
      : {
          repository: GITHUB_REPOSITORY,
          status: "not_connected" as const,
          message:
            "The target repository is configured for an approved Replit source-control connection. Sign in with an authorized workspace account to verify it. No repository credential is stored in the workspace.",
        };

  res.json(GetApplicationAccessStatusResponse.parse({
    authorization,
    application: {
      session: {
        status: sessionStatus,
        mode,
        message: sessionMessage,
      },
      identityProvider,
      authorization: authorizationState,
      repository,
    },
  }));
});

export default router;
