#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi

RECEIPT_FILE=""
if [ "${1:-}" = "--receipt" ]; then
  RECEIPT_FILE="${2:-}"
  shift 2
fi
[ "$#" = "0" ] || { echo "[错误] local-release-gate.sh 只接受 --receipt FILE"; exit 2; }
[ -n "$RECEIPT_FILE" ] || { echo "[错误] 缺少 --receipt FILE"; exit 2; }
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR is required}"

cd "$REPOSITORY_ROOT"
node ops/prune-local-check-cache.mjs
mkdir -p .cache/release-check/playwright
export PLAYWRIGHT_BROWSERS_PATH="$REPOSITORY_ROOT/.cache/release-check/playwright"

SOURCE_SHA="$(git rev-parse HEAD)"
SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
FULL_CI_RECEIPT_FILE="$(git rev-parse --git-path workspace-local-full-ci.json)"
if ! node scripts/ci/local-full-ci-receipt.mjs verify \
  --tree "$SOURCE_TREE" --file "$FULL_CI_RECEIPT_FILE" >/dev/null; then
  echo "[错误] 缺少当前 source tree 的全量 CI 回执；先运行 npm run check:ci" >&2
  exit 1
fi
if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/BUILD_ID)" != "$SOURCE_SHA" ]; then
  echo "[错误] 当前全量 CI 没有留下 BUILD_ID 等于 source SHA 的 production build" >&2
  exit 1
fi
mkdir -p "$(dirname "$RECEIPT_FILE")"
rm -f "$RECEIPT_FILE"

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

psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database_name\";" >/dev/null
export DATABASE_URL="$database_url"
export DIRECT_URL="$database_url"
unset SHADOW_DATABASE_URL

npx prisma migrate deploy --schema=./prisma >/dev/null
npm run db:seed:resources >/dev/null
npx playwright install chromium
PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 PLAYWRIGHT_STANDALONE_COMMIT="$SOURCE_SHA" CI=1 npm run test:e2e

node ops/local-release-gate-receipt.mjs create \
  --source "$SOURCE_SHA" \
  --tree "$SOURCE_TREE" \
  --full-ci "$FULL_CI_RECEIPT_FILE" \
  --output "$RECEIPT_FILE"
