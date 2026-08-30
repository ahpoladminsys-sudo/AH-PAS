---
name: OpenAPI and installed Zod compatibility
description: A generator/runtime compatibility constraint for numeric API fields in this workspace.
---

OpenAPI `integer` response fields currently generate `zod.int()`, which is unavailable in the installed Zod 3 runtime. Use `number` for API count fields unless the Zod dependency and generated output are upgraded together.

**Why:** API code generation can succeed while the required workspace typecheck fails on the generated validator.

**How to apply:** Regenerate from the API specification and validate the complete workspace, because partial checks can consume stale generated declarations.