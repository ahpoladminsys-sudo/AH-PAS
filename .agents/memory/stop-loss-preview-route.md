---
name: Stop Loss preview route
description: Why the Stop Loss artifact must retain a dedicated preview subpath instead of owning the workspace root.
---

Keep the Stop Loss Quote & Policy Workspace on a dedicated artifact preview path rather than moving it back to the workspace root.

**Why:** With root ownership, the managed workflow repeatedly failed readiness even though Vite was listening and the identical manually started process served HTTP 200. Registering the artifact on its dedicated subpath allowed the managed workflow to start and route normally.

**How to apply:** Preserve the dedicated artifact path when changing its manifest, Vite base, production build, or internal links. Keep protected APIs on the separate `/api` service route.