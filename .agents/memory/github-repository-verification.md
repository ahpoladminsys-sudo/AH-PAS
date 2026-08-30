---
name: GitHub repository verification
description: Security boundary for reporting a configured GitHub source repository as connected.
---

Report a GitHub source repository as connected only when the approved connector verifies the exact owner/name, public visibility, push permission, and expected default branch. Distinguish inaccessible repositories from temporary connector outages, and report an empty repository honestly rather than implying history exists.

**Why:** A successful API response or matching repository name alone can conceal a private, read-only, wrong-branch, or empty target and mislead operators about source-control readiness.

**How to apply:** Use this rule for application status cards and source-control health checks. Keep credentials in the connector boundary and expose only redacted classifications and actionable guidance.