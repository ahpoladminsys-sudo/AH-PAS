---
name: RFP extraction safety
description: Guardrails for extracting quote data from varied Stop Loss PDFs without promoting procurement language or misaligned columns into underwriting fields.
---

Classify each source as an underwriting cover sheet, procurement solicitation, or unknown format before deciding whether extracted values may be applied. Reconstruct PDF text by grouping items on their Y coordinate and sorting each row by X coordinate; stream order is unreliable for spreadsheet-generated cover sheets. Require nearby label or current-plan evidence for each value, and gate procurement or ambiguous results behind explicit source verification.

**Why:** Spreadsheet PDFs may emit label and value columns out of reading order, while long procurement RFPs contain repeated dates, company placeholders, contract terms, and stop-loss language that can look like quote data. Trusting flattened text or first-match values caused incorrect or missing fields.

**How to apply:** Preserve line boundaries and column order, prefer explicit plan-sponsor/current-plan statements over blank vendor forms, never let AI overwrite an evidenced browser extraction, block automatic application when evidence is insufficient, and retain blocked documents only through an explicit manual-review action.