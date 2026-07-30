#!/usr/bin/env bash
set -euo pipefail

cd /workspace
/bin/bash /workspace-dev/install-node-deps.sh

export DATABASE_URL
DATABASE_URL="$(
  node /workspace-dev/render-database-url.mjs \
    workspace_dev_runtime \
    workspace_dev \
    /run/secrets/workspace_dev_runtime_password \
    workspace-dev-app
)"
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/run/secrets/postgres_ca
unset DIRECT_URL SHADOW_DATABASE_URL PGPASSWORD PGOPTIONS

exec npm run dev
