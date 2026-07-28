#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi

RECEIPT_FILE=""
UNIT_ID=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --receipt) shift; RECEIPT_FILE="${1:-}" ;;
    --deploy-unit) shift; UNIT_ID="${1:-}" ;;
    *) echo "[错误] local-release-gate.sh 只接受 --receipt FILE 和可选 --deploy-unit UNIT"; exit 2 ;;
  esac
  shift
done
[ -n "$RECEIPT_FILE" ] || { echo "[错误] 缺少 --receipt FILE"; exit 2; }
if [ -n "$UNIT_ID" ] && ! printf '%s' "$UNIT_ID" | grep -Eq '^[a-z][a-z0-9-]*$'; then
  echo "[错误] deploy unit id 无效: $UNIT_ID" >&2
  exit 2
fi
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR is required}"

cd "$REPOSITORY_ROOT"
node ops/prune-local-check-cache.mjs
if [ -n "$(git status --short)" ]; then
  echo "[错误] local release gate 必须从干净且已提交的 release worktree 运行" >&2
  git status --short
  exit 1
fi
mkdir -p .cache/release-check/playwright "$(dirname "$RECEIPT_FILE")"
export PLAYWRIGHT_BROWSERS_PATH="$REPOSITORY_ROOT/.cache/release-check/playwright"
rm -f "$RECEIPT_FILE"

SOURCE_SHA="$(git rev-parse HEAD)"
SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
FULL_CI_RECEIPT_FILE="$(git rev-parse --git-path workspace-local-full-ci.json)"
IDENTITY_DIRECTORY=""
database_name=""
admin_url=""

assert_clean_release_tree() {
  if [ -n "$(git status --short)" ]; then
    echo "[错误] local release gate 必须保持干净且已提交的 release worktree" >&2
    git status --short
    exit 1
  fi
}

cleanup() {
  local exit_code=$?
  if [ -n "$database_name" ] && [ -n "$admin_url" ]; then
    psql "$admin_url" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database_name' AND pid <> pg_backend_pid();" >/dev/null || true
    psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$database_name\";" >/dev/null || true
  fi
  if [ -n "$IDENTITY_DIRECTORY" ]; then
    case "$IDENTITY_DIRECTORY" in
      "$REPOSITORY_ROOT/.cache/release-check/unit-identities/"*) rm -rf -- "$IDENTITY_DIRECTORY" ;;
      *) echo "[警告] 拒绝清理非预期 unit identity 目录: $IDENTITY_DIRECTORY" >&2 ;;
    esac
  fi
  npm run playwright:processes:check || true
  return "$exit_code"
}
trap cleanup EXIT

if [ -z "$UNIT_ID" ]; then
  if ! node scripts/ci/local-full-ci-receipt.mjs verify \
    --tree "$SOURCE_TREE" --file "$FULL_CI_RECEIPT_FILE" >/dev/null; then
    echo "[错误] 缺少当前 source tree 的全量 CI 回执；先运行 npm run check:ci" >&2
    exit 1
  fi
  if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/BUILD_ID)" != "$SOURCE_SHA" ]; then
    echo "[错误] 当前全量 CI 没有留下 BUILD_ID 等于 source SHA 的 production build" >&2
    exit 1
  fi
else
  UNIT_CI_RECEIPT_FILE="${LOCAL_UNIT_CI_RECEIPT_FILE:-$REPOSITORY_ROOT/.cache/release-check/units/$UNIT_ID-base.json}"
  UNIT_OUTPUT_ROOT=".cache/release-check/unit-builds/$UNIT_ID"
  echo "==> 构建并验证 $UNIT_ID 的图派生 TypeScript/Next standalone 闭包..."
  ALLOW_NON_LINUX_UNIT_BUILD=1 \
  DEPLOY_UNIT_OUTPUT_ROOT="$UNIT_OUTPUT_ROOT" \
    "$REPOSITORY_ROOT/ops/build-deploy-unit-artifact.sh" "$UNIT_ID"
  CONTRACT_FILE="$REPOSITORY_ROOT/$UNIT_OUTPUT_ROOT/deploy-unit-contract.json"
  ARTIFACT_FILE="$REPOSITORY_ROOT/$UNIT_OUTPUT_ROOT/$UNIT_ID-standalone.tgz"
  MANIFEST_FILE="$REPOSITORY_ROOT/$UNIT_OUTPUT_ROOT/$UNIT_ID-standalone.manifest.json"
  E2E_PLAN="$(node --conditions=react-server --import tsx scripts/testing/deploy-unit-e2e-plan.ts --unit "$UNIT_ID")"
  E2E_GREP="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).grepPattern)' "$E2E_PLAN")"
  BASE_PATH="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).build.basePath)' "$CONTRACT_FILE")"
  HEALTH_PATH="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).runtime.healthPath)' "$CONTRACT_FILE")"
  DEPLOYMENT_ID="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).build.deploymentId)' "$MANIFEST_FILE")"
  PLAYWRIGHT_READY_PATH="${BASE_PATH%/}${HEALTH_PATH}"
  mkdir -p "$REPOSITORY_ROOT/.cache/release-check/unit-identities"
  IDENTITY_DIRECTORY="$(mktemp -d "$REPOSITORY_ROOT/.cache/release-check/unit-identities/$UNIT_ID.XXXXXX")"
  node ops/local-deploy-unit-identity.mjs --unit "$UNIT_ID" --output "$IDENTITY_DIRECTORY" >/dev/null
fi

database_suffix="${UNIT_ID:-full}"
database_name="workspace_release_$(date +%Y%m%d%H%M%S)_$$_${database_suffix}_e2e"
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

psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database_name\";" >/dev/null
export DATABASE_URL="$database_url"
export DIRECT_URL="$database_url"
unset SHADOW_DATABASE_URL

npx prisma migrate deploy --schema=./prisma >/dev/null
npm run db:seed:resources >/dev/null
npx playwright install chromium
if [ -z "$UNIT_ID" ]; then
  PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 PLAYWRIGHT_STANDALONE_COMMIT="$SOURCE_SHA" CI=1 npm run test:e2e
  assert_clean_release_tree
  node ops/local-release-gate-receipt.mjs create \
    --source "$SOURCE_SHA" \
    --tree "$SOURCE_TREE" \
    --full-ci "$FULL_CI_RECEIPT_FILE" \
    --output "$RECEIPT_FILE"
else
  echo "==> 在一次性数据库上运行 $UNIT_ID standalone 的运行时与声明 E2E..."
  npm run test:e2e:seed
  PLAYWRIGHT_STANDALONE_ARCHIVE="$ARTIFACT_FILE" \
  PLAYWRIGHT_STANDALONE_MANIFEST="$MANIFEST_FILE" \
  PLAYWRIGHT_STANDALONE_COMMIT="$SOURCE_SHA" \
  PLAYWRIGHT_WEB_SERVER_READY_PATH="$PLAYWRIGHT_READY_PATH" \
  E2E_DEPLOY_UNIT_ID="$UNIT_ID" \
  E2E_DEPLOYMENT_ID="$DEPLOYMENT_ID" \
  WORKSPACE_DEPLOY_UNIT_ID="$UNIT_ID" \
  WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="$IDENTITY_DIRECTORY/private.pem" \
  WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="$IDENTITY_DIRECTORY/trusted-public-keys.json" \
  WORKSPACE_INTERNAL_REPLAY_DIRECTORY="$IDENTITY_DIRECTORY/replay" \
  NEXT_PUBLIC_BUILD_VERSION="$DEPLOYMENT_ID" \
  BUILD_VERSION="$DEPLOYMENT_ID" \
  CI=1 npx playwright test --grep "$E2E_GREP"
  assert_clean_release_tree
  node ops/local-release-gate-receipt.mjs create \
    --source "$SOURCE_SHA" \
    --tree "$SOURCE_TREE" \
    --unit "$UNIT_ID" \
    --unit-ci "$UNIT_CI_RECEIPT_FILE" \
    --unit-contract "$CONTRACT_FILE" \
    --unit-manifest "$MANIFEST_FILE" \
    --output "$RECEIPT_FILE"
fi
