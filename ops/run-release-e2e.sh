#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR is required}"

mkdir -p .cache/release-check/playwright
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/release-check/playwright"

SOURCE_SHA="${RELEASE_SOURCE_SHA:-$(git rev-parse HEAD)}"
database_name="workspace_release_$(date +%Y%m%d%H%M%S)_$$_e2e"
case "$database_name" in (*[!a-zA-Z0-9_]*) echo "[错误] 一次性数据库名称不安全"; exit 1;; esac
admin_url="$(node --input-type=module - <<'NODE'
import "dotenv/config";
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
url.pathname = "/postgres";
process.stdout.write(url.toString());
NODE
)"
database_url="$(CHECK_DATABASE_NAME="$database_name" node --input-type=module - <<'NODE'
import "dotenv/config";
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
url.pathname = `/${process.env.CHECK_DATABASE_NAME}`;
process.stdout.write(url.toString());
NODE
)"

cleanup() {
  local exit_code=$?
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database_name' AND pid <> pg_backend_pid();" >/dev/null || true
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$database_name\";" >/dev/null || true
  npm run playwright:processes:check || true
  return "$exit_code"
}
trap cleanup EXIT

npx playwright install --with-deps chromium
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database_name\";" >/dev/null
export DATABASE_URL="$database_url"
export DIRECT_URL="$database_url"
unset SHADOW_DATABASE_URL

npx prisma migrate deploy --schema=./prisma >/dev/null
npm run db:seed:resources >/dev/null
if [ "${E2E_MODE:-full}" = "full" ]; then
  PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 PLAYWRIGHT_STANDALONE_COMMIT="$SOURCE_SHA" CI=1 npm run test:e2e
else
  PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 PLAYWRIGHT_STANDALONE_COMMIT="$SOURCE_SHA" CI=1 \
    node scripts/ci/run-selected-e2e.mjs
fi
