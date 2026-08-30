import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { AuthorizationError } from "./lib/user-authorization";

const app: Express = express();

const portableAllowedOrigins = new Set(
  (process.env.PORTABLE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(cors({
  credentials: true,
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Portable-Session"],
  maxAge: 600,
  origin(origin, callback) {
    // Same-origin browser requests omit Origin. A downloaded file has the
    // opaque "null" origin; it is accepted only as the narrow portable
    // client boundary and receives no long-lived browser credential.
    if (!origin || origin === "null" || portableAllowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// This must precede all body parsers because Clerk proxy requests stream raw bytes.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Drive uploads arrive as base64 JSON from the standalone HTML workspace.
// Keep the limit above the largest expected document while still bounded.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// The standalone HTML client retrieves only the publishable key, then loads
// Clerk through the same-domain proxy. No access token is exposed or stored.
app.get("/api/auth/config", (req, res) => {
  res.json({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    proxyUrl: process.env.NODE_ENV === "production" ? CLERK_PROXY_PATH : "",
  });
});

app.use("/api", router);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const candidate = error as { type?: string; status?: number; statusCode?: number; name?: string };
  if (error instanceof AuthorizationError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      category: error.category,
      recoverable: error.recoverable,
    });
  }
  if (candidate.status === 401 || candidate.statusCode === 401) {
    return res.status(401).json({
      error: "Authentication is required for this protected request.",
      code: "SESSION_REQUIRED",
      category: "authentication",
      recoverable: true,
    });
  }
  if (candidate.type === "entity.too.large" || candidate.status === 413 || candidate.statusCode === 413) {
    return res.status(413).json({ error: "Request body exceeds the 15 MB limit." });
  }
  if (candidate.type === "entity.parse.failed" || candidate instanceof SyntaxError || candidate.name === "ZodError") {
    return res.status(400).json({ error: "Malformed or invalid JSON request body." });
  }
  logger.error({ err: error }, "Unhandled API error");
  return res.status(500).json({ error: "Internal server error." });
});

export default app;
