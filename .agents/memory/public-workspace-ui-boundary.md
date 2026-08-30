---
name: Public workspace UI boundary
description: The app's visible HTML shell does not require sign-in, but connected data APIs remain protected.
---

The user chose to remove the sign-in screen only, not API authorization. Keep the workspace shell renderable without a Clerk session, and handle protected API 401/403 responses as non-blocking in-app states.

**Why:** The user wants direct access to the HTML workspace while policy documents, Google Sheets data, Drive storage, Gemini, and licensing validation must not become publicly writable or readable.

**How to apply:** Do not remove server-side `requireAuth` from connected routes when changing the UI entry flow. Avoid restoring a full-page authentication gate for expected unauthenticated API failures.