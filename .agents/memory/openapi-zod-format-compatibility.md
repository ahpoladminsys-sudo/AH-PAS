---
name: OpenAPI/Zod format compatibility
description: Generator behavior for URI and email formats in this workspace's Zod 3 validation package
---

OpenAPI `format: uri` and `format: email` may generate top-level Zod 4 helpers such as `zod.url()` and `zod.email()`, which are unavailable in the workspace's Zod 3 package. Prefer compatible regex patterns for generated client/server schemas.

**Why:** API code generation can succeed while the workspace typecheck fails after a harmless-looking format change.

**How to apply:** Run API codegen followed by `pnpm run typecheck:libs`; if generated output uses unsupported format helpers, replace the format with an equivalent OpenAPI pattern before regenerating.