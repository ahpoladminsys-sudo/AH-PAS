import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  getClerkProxyHost,
} from "../middlewares/clerkProxyMiddleware";
import { authorizeUserId } from "./user-authorization";

export const PORTABLE_SESSION_HEADER = "x-portable-session";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const challenges = new Map<string, number>();

type PortableClaims = {
  userId: string;
  nonce: string;
  expiresAt: number;
};

export type PortableSessionInspection = {
  claims: PortableClaims | null;
  reason: "missing" | "invalid" | "expired" | "valid";
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is required for portable sessions.");
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function authUserId(req: Parameters<typeof getAuth>[0]): string | null {
  const auth = getAuth(req);
  const claimUserId = auth?.sessionClaims?.userId;
  return typeof claimUserId === "string" ? claimUserId : auth?.userId ?? null;
}

function appOrigin(req: { headers: Record<string, string | string[] | undefined>; protocol?: string }): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
    ?.split(",")[0]
    ?.trim() || req.protocol || "https";
  const host = getClerkProxyHost(req) || "localhost";
  return `${protocol}://${host}`;
}

function pageJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function htmlPage(title: string, body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root{font-family:"IBM Plex Sans",Inter,system-ui,sans-serif;color:#003648;background:#f7fafb}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
    main{width:min(520px,100%);background:#fff;border:1px solid #d8e4e6;border-radius:16px;box-shadow:0 22px 70px rgba(0,54,72,.16);padding:28px}
    h1{font:700 24px "IBM Plex Serif",Georgia,serif;margin:0 0 8px;color:#003648}
    p{line-height:1.5;color:#567078;margin:0 0 18px}.mark{color:#1fa0b3;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:11px;margin-bottom:12px}
    #portable-status{font-size:13px;margin-top:14px;color:#567078}#portable-status.error{color:#a53e46}
    #clerk-sign-in{margin-top:18px}.github-sign-in{width:100%;border:0;border-radius:8px;padding:11px 14px;background:#24292f;color:#fff;font:700 14px inherit;cursor:pointer}.github-sign-in:hover,.github-sign-in:focus-visible{background:#111820;outline:3px solid rgba(31,160,179,.28);outline-offset:2px}.divider{display:flex;align-items:center;gap:10px;margin:15px 0;color:#789097;font-size:11px}.divider:before,.divider:after{content:"";height:1px;flex:1;background:#d8e4e6}.hidden{display:none}
  </style>
</head>
<body><main><div class="mark">Tinubu Stop Loss</div>${body}</main><script>${script}</script></body>
</html>`;
}

function completionPage(nonce: string, portableSession: string, expiresAt: number): string {
  return htmlPage(
    "Tinubu cloud session",
    "<h1>Connecting your cloud session</h1><p id=\"portable-status\">This window will close when the secure handoff is complete.</p>",
    `const nonce=${pageJson(nonce)};const portableSession=${pageJson(portableSession)};const expiresAt=${pageJson(new Date(expiresAt).toISOString())};
const status=document.getElementById("portable-status");
 function finish(body){
    if(window.opener&&!window.opener.closed){
       window.opener.postMessage({type:"tinubu-portable-session",nonce,sessionToken:body.portableSession,expiresAt:body.expiresAt},"*");
      status.textContent="Connected. You can close this window.";
      setTimeout(()=>window.close(),250);
    }else{status.textContent="Connected. Return to the downloaded workspace.";}}
 finish({portableSession,expiresAt});`,
  );
}

function signInPage(nonce: string, req: Parameters<typeof getAuth>[0]): string {
  const publishableKey = publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  );
  const origin = appOrigin(req);
  const clerkScript = process.env.NODE_ENV === "production"
    ? `${origin}${CLERK_PROXY_PATH}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
    : "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
  const proxyUrl = process.env.NODE_ENV === "production"
    ? CLERK_PROXY_PATH
    : "";
  return htmlPage(
    "Sign in to Tinubu cloud",
    "<h1>Sign in to connect cloud services</h1><p>Choose GitHub or another configured Clerk provider. The server still checks the workspace operator allowlist before protected services become available.</p><button id=\"github-sign-in\" class=\"github-sign-in\" type=\"button\">Continue with GitHub</button><div class=\"divider\">or use another secure sign-in option</div><div id=\"clerk-sign-in\"></div><div id=\"portable-status\">Loading secure sign-in…</div>",
    `const config=${pageJson({ publishableKey, proxyUrl, clerkScript, nonce })};
const status=document.getElementById("portable-status");
const githubButton=document.getElementById("github-sign-in");
function setStatus(text,error){status.textContent=text;status.className=error?"error":"";}
 let completing=false;
 async function complete(clerk){
   if(completing)return;completing=true;
   const token=clerk&&clerk.session&&await clerk.session.getToken();
   const headers={"Content-Type":"application/json"};if(token)headers.Authorization="Bearer "+token;
   fetch("/api/auth/portable/exchange",{method:"POST",headers,body:JSON.stringify({nonce}),credentials:"include"})
    .then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"The secure handoff could not be completed.");return body;})
    .then(body=>{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage({type:"tinubu-portable-session",nonce,sessionToken:body.portableSession,expiresAt:body.expiresAt},"*");
        setStatus("Connected. You can close this window.");
        setTimeout(()=>window.close(),250);
      }else setStatus("Connected. Return to the downloaded workspace.");
    }).catch(error=>{completing=false;setStatus(error.message,true);});
}
const script=document.createElement("script");script.src=config.clerkScript;script.async=true;
script.setAttribute("data-clerk-publishable-key",config.publishableKey||"");
if(config.proxyUrl)script.setAttribute("data-clerk-proxy-url",config.proxyUrl);
script.onload=async()=>{
  try{
    if(!config.publishableKey)throw new Error("Hosted Clerk authentication is not configured.");
    if(!window.Clerk||typeof window.Clerk.load!=="function")throw new Error("Secure sign-in did not initialize.");
    const clerk=window.Clerk;
    await clerk.load();
    githubButton.onclick=async()=>{
      try{
        setStatus("Opening GitHub sign-in through Clerk…");
        const signIn=clerk.client&&clerk.client.signIn;
        if(!signIn||typeof signIn.authenticateWithRedirect!=="function")throw new Error("GitHub sign-in is not available from this Clerk configuration.");
        await signIn.authenticateWithRedirect({strategy:"oauth_github",redirectUrl:window.location.href,redirectUrlComplete:window.location.href});
      }catch(error){setStatus(error.message||"GitHub sign-in could not start.",true);}
    };
     clerk.addListener(({session})=>{if(session)complete(clerk);});
     if(clerk.session) complete(clerk);
    else {setStatus("Sign in below to continue.");clerk.mountSignIn(document.getElementById("clerk-sign-in"),{afterSignInUrl:window.location.href,afterSignUpUrl:window.location.href});}
  }catch(error){setStatus(error.message||"Secure sign-in could not load.",true);}
};script.onerror=()=>setStatus("Secure sign-in could not load. Check the hosted API connection.",true);document.head.appendChild(script);`,
  );
}

export function createPortableSessionToken(userId: string, nonce: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = encode(JSON.stringify({ userId, nonce, expiresAt } satisfies PortableClaims));
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyPortableSessionToken(token: string | undefined): PortableClaims | null {
  return inspectPortableSessionToken(token).claims;
}

export function inspectPortableSessionToken(token: string | undefined): PortableSessionInspection {
  if (!token) return { claims: null, reason: "missing" };
  const [payload, signature, ...extra] = token.split(".");
  if (extra.length || !payload || !signature) return { claims: null, reason: "invalid" };
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { claims: null, reason: "invalid" };
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PortableClaims>;
    if (
      typeof claims.userId !== "string"
      || typeof claims.nonce !== "string"
      || typeof claims.expiresAt !== "number"
    ) return { claims: null, reason: "invalid" };
    if (claims.expiresAt <= Date.now()) return { claims: null, reason: "expired" };
    return { claims: claims as PortableClaims, reason: "valid" };
  } catch {
    return { claims: null, reason: "invalid" };
  }
}

const router = Router();

router.post("/auth/portable/start", (_req, res) => {
  for (const [nonce, expiresAt] of challenges) {
    if (expiresAt <= Date.now()) challenges.delete(nonce);
  }
  const nonce = randomBytes(24).toString("base64url");
  challenges.set(nonce, Date.now() + CHALLENGE_TTL_MS);
  const authorizeUrl = `${appOrigin(_req)}/api/auth/portable/authorize?nonce=${encodeURIComponent(nonce)}`;
  res.json({ authorizeUrl, nonce, expiresAt: challenges.get(nonce), sessionTtlSeconds: SESSION_TTL_MS / 1000 });
});

router.get("/auth/portable/authorize", async (req, res, next) => {
  const nonce = typeof req.query.nonce === "string" ? req.query.nonce : "";
  const expiresAt = challenges.get(nonce);
  if (!nonce || !expiresAt || expiresAt <= Date.now()) {
    res.status(400).type("html").send(htmlPage("Expired cloud handoff", "<h1>This sign-in link has expired</h1><p>Return to the downloaded workspace and start a new cloud connection.</p>", ""));
    return;
  }
  const userId = authUserId(req);
  if (userId) {
    try {
      await authorizeUserId(userId);
      challenges.delete(nonce);
      const session = createPortableSessionToken(userId, nonce);
      res.type("html").send(completionPage(nonce, session.token, session.expiresAt));
    } catch (error) {
      next(error);
    }
    return;
  }
  res.type("html").send(signInPage(nonce, req));
});

router.post("/auth/portable/exchange", async (req, res, next) => {
  const nonce = typeof req.body?.nonce === "string" ? req.body.nonce : "";
  const expiresAt = challenges.get(nonce);
  if (!nonce || !expiresAt || expiresAt <= Date.now()) {
    res.status(409).json({
      error: "This cloud handoff has expired. Start a new connection.",
      code: "PORTABLE_HANDOFF_EXPIRED",
      category: "authentication",
      recoverable: true,
    });
    return;
  }
  const userId = authUserId(req);
  if (!userId) {
    res.status(401).json({
      error: "Sign in before completing the cloud handoff.",
      code: "SESSION_REQUIRED",
      category: "authentication",
      recoverable: true,
    });
    return;
  }
  try {
    await authorizeUserId(userId);
    challenges.delete(nonce);
    const session = createPortableSessionToken(userId, nonce);
    res.json({
      portableSession: session.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;