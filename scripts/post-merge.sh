#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Durable SQL migrations are safe to run repeatedly and are recorded by
# Drizzle. Do not use schema push here: it is an interactive/dev reconcile.
pnpm --filter @workspace/db migrate
