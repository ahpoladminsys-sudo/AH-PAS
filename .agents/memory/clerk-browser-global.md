---
name: Clerk browser global
description: Compatibility rule for Clerk v5 loaded from its browser CDN in hosted authentication handoff pages.
---

When loading Clerk v5 from `clerk.browser.js`, treat `window.Clerk` as the global Clerk object. Set the script's Clerk publishable-key and proxy-url data attributes, wait for the script to load, then call `window.Clerk.load()`. Do not instantiate it with `new window.Clerk(...)`.

For popup session handoffs, issue the short-lived application session during an already-authenticated authorize request when possible. If the browser sign-in page must exchange after Clerk loads, send `clerk.session.getToken()` as a bearer token instead of relying only on a follow-up cookie-authenticated fetch.

**Why:** In this Replit-managed Clerk environment, the browser global is not a constructor, and a second popup fetch can lose the browser session even when the preceding top-level authorize request was authenticated. These failures prevent the secure handoff from completing.

**How to apply:** Use this pattern in plain-HTML authentication pages and popup handoffs that load Clerk from the CDN or Clerk proxy. React integrations should continue using their framework provider.