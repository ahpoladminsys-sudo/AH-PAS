---
name: Pending review recovery
description: Protecting staged operator decisions from refreshes and stale asynchronous remote hydration.
---

Recoverable operator review state must survive both browser refresh and a remote snapshot that was captured before the latest local save. A pending review may be restored only while its referenced current file remains the active file; approval or cancellation must remove the recoverable record.

**Why:** A delayed remote write can leave the next page load with an older registry, which otherwise hides a candidate and makes an in-progress approval preview look lost even though the browser had already staged it.

**How to apply:** Keep pending review state separate from the active lookup, retain the locally staged candidate/current records when hydrating an older remote snapshot, and never refresh live lookup data during restoration. For cross-tab storage events, do not delete a pending record merely because its referenced files have not arrived yet; when the same review is already open locally, merge remote data while keeping local row decisions.