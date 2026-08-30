---
name: Google Drive sharing quota
description: Why ordinary document uploads must be separated from explicit Google Drive sharing operations.
---

Normal uploads should create files in the connected Google Drive without automatically adding a sharing permission on every request. Sharing or ownership changes must remain an explicit user action.

**Why:** Google can successfully create the file and then reject the repeated permission request with a sharing-quota error. Treating the combined operation as a failed upload hides an already-created file and encourages duplicate retries.

**How to apply:** Keep upload, listing, preview, and download independent of sharing. Use the explicit share/ownership flow only when the destination account actually needs a new permission. For shared-drive files, include the Drive API all-drives flags on list, metadata, upload, move, download, and permission requests so the file remains discoverable and addressable.