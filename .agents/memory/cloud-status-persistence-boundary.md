---
name: Cloud status persistence boundary
description: Prevent cloud status reporting and authorization failures from creating automatic persistence loops.
---

Cloud persistence outcomes must update visible status without writing a new event that schedules the same persistence operation again. After a protected request returns 401 or 403, automatic background sync must pause until an explicit refresh or successful reconnection. When an older remote workspace snapshot hydrates after status or session events were recorded locally, merge and deduplicate the event histories instead of replacing the local history.

**Why:** Persisting a status event as part of the state being persisted creates a feedback cycle. Repeated unauthorized retries also produce log growth and unnecessary API traffic without any chance of succeeding. Replacing local history during post-auth hydration can silently discard the very handoff and recovery events that explain how the session became available.

**How to apply:** Keep user/domain changes as persistence triggers, treat persistence-result status as observational, deduplicate unchanged cloud events, merge local unsynced events into a hydrated remote snapshot, and fail closed on authorization errors while preserving explicit reconnect/refresh controls. Public inline cloud actions must consume recoverable provider errors after updating visible state; returning a rejected promise from an inline action triggers the Vite runtime overlay.
