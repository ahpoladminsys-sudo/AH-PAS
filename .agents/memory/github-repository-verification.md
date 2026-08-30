---
name: GitHub repository verification
description: Security boundary for reporting a configured GitHub source repository as connected.
---

Report a GitHub source repository as connected only when the approved connector verifies the exact owner/name, public visibility, push permission, and expected default branch. Distinguish inaccessible repositories from temporary connector outages, and report an empty repository honestly rather than implying history exists.

**Why:** A successful API response or matching repository name alone can conceal a private, read-only, wrong-branch, or empty target and mislead operators about source-control readiness.

**How to apply:** Use this rule for application status cards and source-control health checks. Keep credentials in the connector boundary and expose only redacted classifications and actionable guidance.

For an empty GitHub repository, bootstrap `main` with the Contents API before using Git Database endpoints; blob creation can return `409` while no commit exists. Avoid one blob write per tracked text file because GitHub secondary write limits can interrupt large snapshots. Upload true binary blobs, inline UTF-8 files into a small number of top-level trees, then assemble and verify one root tree.

**Why:** Empty repositories reject Git Database writes before initialization, and burst-uploading hundreds of blobs can trigger `403` secondary throttling even when the OAuth connection is healthy and the primary rate limit is untouched.

**How to apply:** Keep the branch update non-forced, preserve local Git modes, and compare every remote path/mode/blob hash with the clean local `HEAD` before reporting the snapshot as complete.