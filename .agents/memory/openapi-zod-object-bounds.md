---
name: OpenAPI and generated Zod object bounds
description: A generator limitation for bounded object metadata in API request contracts.
---

OpenAPI `maxProperties` may remain documented in the contract without appearing in the generated Zod validator. Any security or cost boundary that depends on a maximum object key count must be enforced explicitly in the server route after generated validation.

**Why:** The workspace generator preserved string value limits for an `additionalProperties` map but omitted the map's `maxProperties` constraint, so generated validation alone did not bound the number of metadata keys.

**How to apply:** Keep `maxProperties` in OpenAPI for clients and documentation, inspect the generated Zod output after codegen, and add a server-side key-count check when the generated schema omits it.