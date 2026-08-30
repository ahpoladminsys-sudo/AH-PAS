---
name: Vite Node built-in imports
description: Environment-specific Vite config behavior for Node standard-library imports
---

Vite configuration code that uses Node standard-library modules should use explicit `node:` imports and named APIs where available.

**Why:** In this workspace, a default CommonJS-style import of the crypto module was transformed into a dynamic require that Vite could not execute during the dev preview, even though the production build path appeared healthy.

**How to apply:** When adding filesystem, hashing, or other Node-only logic to a Vite config, prefer explicit imports such as `node:crypto` and verify both the standalone build and the managed preview workflow.