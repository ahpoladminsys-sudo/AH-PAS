import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import {
  PORTABLE_SESSION_HEADER,
  inspectPortableSessionToken,
} from "../lib/portable-auth";
import { authorizeUserId } from "../lib/user-authorization";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Cookie-session authentication plus the server-side application allowlist. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const portableToken = req.header(PORTABLE_SESSION_HEADER);
  const portableInspection = inspectPortableSessionToken(portableToken);
  if (portableToken && !portableInspection.claims) {
    const expired = portableInspection.reason === "expired";
    res.status(401).json({
      error: expired
        ? "The portable cloud session has expired. Connect again to continue."
        : "The portable cloud session is invalid. Connect again to continue.",
      code: expired ? "PORTABLE_SESSION_EXPIRED" : "PORTABLE_SESSION_INVALID",
      category: "authentication",
      recoverable: true,
    });
    return;
  }
  const portableClaims = portableInspection.claims;
  if (portableClaims) {
    try {
      await authorizeUserId(portableClaims.userId);
      req.userId = portableClaims.userId;
      next();
      return;
    } catch (error) {
      next(error);
      return;
    }
  }
  const auth = getAuth(req);
  const claimUserId = auth?.sessionClaims?.userId;
  const userId = typeof claimUserId === "string" ? claimUserId : auth?.userId;
  if (!userId) {
    res.status(401).json({
      error: "Sign in to continue using protected cloud services.",
      code: "SESSION_REQUIRED",
      category: "authentication",
      recoverable: true,
    });
    return;
  }

  try {
    await authorizeUserId(userId);
    req.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}