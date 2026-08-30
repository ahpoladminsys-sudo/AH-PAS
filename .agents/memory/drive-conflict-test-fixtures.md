---
name: Drive conflict test fixtures
description: The two distinct Google Drive requests that a safe workbook conflict recovery must model.
---

Drive workbook conflict fixtures must model metadata reads and media reads as separate operations: the write route checks the metadata timestamp before a PUT, while recovery loads the actual workbook bytes through a media response.

**Why:** A fixture that only advances metadata can falsely suggest that refresh worked while the browser cannot parse the newer workbook, leaving the safety path untested.

**How to apply:** When testing Drive recovery, assert the media GET occurs before the explicit retry PUT, and keep a structured workbook payload available from the media endpoint.