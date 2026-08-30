---
name: Sheets optimistic revisions
description: Rules for preventing stale Google Sheets writers from overwriting newer workbook data.
---

Any client that must protect against stale writes should send the revision from its latest full workbook snapshot. The server must compare that revision against a fresh full-workbook read inside the serialized mutation boundary before any clear or update.

After a successful write, the server must read the complete persisted workbook again and return a revision derived from that post-write representation, including untouched tabs.

**Why:** Input values can be normalized by Sheets, and subset writes do not represent the complete workbook. Hashing submitted input or only submitted tabs produces revision tokens that differ from the next snapshot and cannot safely coordinate competing writers.

**How to apply:** Recursively canonicalize revision input, preserve row order, sort tab names and object keys, reject mismatches before destructive calls, and test both clear and update counts so a stale request proves it performed no mutation.