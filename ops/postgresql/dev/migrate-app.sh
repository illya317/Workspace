#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PGPASSWORD PGOPTIONS
}
trap cleanup EXIT

cd /workspace
/bin/bash /workspace-dev/install-node-deps.sh

export DIRECT_URL
DIRECT_URL="$(
  node /workspace-dev/render-database-url.mjs \
    workspace_dev_migrator \
    workspace_dev \
    /run/secrets/workspace_dev_migrator_password \
    workspace-dev-migrator \
    workspace_dev_owner
)"
export DATABASE_URL="${DIRECT_URL}"
export SHADOW_DATABASE_URL
SHADOW_DATABASE_URL="$(
  node /workspace-dev/render-database-url.mjs \
    workspace_dev_migrator \
    workspace_dev_shadow \
    /run/secrets/workspace_dev_migrator_password \
    workspace-dev-migrator \
    workspace_dev_owner
)"
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/run/secrets/postgres_ca
unset PGOPTIONS

npm run db:migrate:dev
node node_modules/prisma/build/index.js db execute \
  --file=/workspace-dev/post-migrate-grants.sql
