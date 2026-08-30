---
name: Google Sheets connector scope
description: Current Google Sheets authorization limits and the required persistence fallback.
---

The current Google Sheets connector grants read-only spreadsheet and Drive scopes. Treat workbook reads as available, but do not claim that structured data reached Sheets unless a write request succeeds.

**Why:** A live write first hit quota throttling and, after batching/retry hardening, returned 403. Authorization inspection confirmed only read-only scopes are available.

Application sign-in and Google connector reauthorization are separate recovery steps. A successful Clerk/portable-session handoff does not renew an expired Replit Google Sheets connection.

**Why:** The application session can authenticate successfully while the connector still returns `invalid_grant`; presenting sign-in as the complete repair leaves users in the same failed state.

**How to apply:** Keep browser caching and Drive JSON backup active on write failure. Guide users through sign-in, connector reauthorization, and a fresh protected status check as distinct steps. If a write-capable connector becomes available later, verify one real tab sync before reporting Sheets as writable.