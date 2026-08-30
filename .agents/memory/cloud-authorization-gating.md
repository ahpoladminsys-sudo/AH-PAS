---
name: Cloud authorization gating
description: Protected cloud polling must be gated by a redacted authorization preflight and recover explicitly after blocked sessions.
---

Protected cloud status and synchronization should first resolve a server-side, redacted authorization state. Missing or invalid authorization, absent portable sessions, and expired sessions must pause protected polling and writes; recovery should be explicit and followed by a fresh status check.

**Why:** Repeated protected requests turn one configuration or session problem into noisy duplicate System Log activity and can make local fallback state appear lost.

**How to apply:** Keep provider failures separate from authentication/configuration failures, deduplicate repeated authorization events, and never retry writes or destructive actions merely because authorization changed.