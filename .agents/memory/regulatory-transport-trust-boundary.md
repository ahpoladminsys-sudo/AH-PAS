---
name: Regulatory transport trust boundary
description: Defines who may assert Live NIPR/DOI connectivity and readiness.
---

Live licensing mode and regulatory transport readiness must be derived from a trusted server adapter, never from browser-persisted state. Until a supported provider is configured and verified, the canonical server state remains Simulation.

**Why:** A browser-only mode gate can be bypassed by a stale or custom client, creating a false regulatory-success claim even when submission endpoints remain blocked.

**How to apply:** New NIPR or state DOI adapters must own provider, capability, authorization, health, and readiness assertions at the server boundary before Live can be persisted or used.