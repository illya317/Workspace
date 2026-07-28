#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"

RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"
mkdir -p "$(dirname "$RECEIPT_FILE")"
rm -f "$RECEIPT_FILE"

start_disposable_postgresql() {
  command -v pg_ctlcluster >/dev/null 2>&1 || {
    echo "[错误] CNB Builder 缺少 PostgreSQL cluster 工具" >&2
    return 1
  }
  local cluster_version
  local cluster_name
  read -r cluster_version cluster_name < <(pg_lsclusters --no-header | awk 'NR == 1 { print $1, $2 }')
  [ -n "$cluster_version" ] && [ -n "$cluster_name" ] || {
    echo "[错误] CNB Builder 没有可用 PostgreSQL cluster" >&2
    return 1
  }
  pg_ctlcluster "$cluster_version" "$cluster_name" start
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace') THEN
    CREATE ROLE workspace LOGIN PASSWORD 'workspace' CREATEDB;
  ELSE
    ALTER ROLE workspace WITH LOGIN PASSWORD 'workspace' CREATEDB;
  END IF;
END
$$;
SQL

  local database_name
  local database_exists
  for database_name in workspace_ci workspace_ci_shadow; do
    database_exists="$(runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname = '$database_name'")"
    if [ "$database_exists" != "1" ]; then
      runuser -u postgres -- createdb --owner=workspace "$database_name"
    fi
  done
}

database_status=0
ci_status=0
e2e_status=0

echo "==> 启动 CNB 一次性 PostgreSQL，供 migration consistency 与全量 E2E 共用"
set +e
start_disposable_postgresql
database_status=$?
set -e

echo "==> CNB 公共发布门禁：Full 与模块使用完全相同的完整 CI 范围"
set +e
env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  NEXT_PUBLIC_BUILD_VERSION="$RELEASE_SOURCE_SHA" \
  BUILD_VERSION="$RELEASE_SOURCE_SHA" \
  npm run check:ci
ci_status=$?
set -e

if [ "$database_status" != "0" ]; then
  echo "[错误] 一次性 PostgreSQL 未就绪；全量 E2E 无法启动" >&2
  e2e_status=91
elif [ -f .next/BUILD_ID ] && [ "$(cat .next/BUILD_ID)" = "$RELEASE_SOURCE_SHA" ]; then
  echo "==> production build 可用；继续执行一次性 PostgreSQL migration/seed 与全量 E2E"
  set +e
  env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
    RELEASE_SOURCE_SHA="$RELEASE_SOURCE_SHA" \
    bash ./ops/run-release-e2e.sh
  e2e_status=$?
  set -e
else
  echo "[错误] production build 未生成或 BUILD_ID 不匹配；全量 E2E 无法启动" >&2
  e2e_status=90
fi

echo "==> CNB 公共发布门禁完整结果"
echo "    disposable-postgresql: $([ "$database_status" = "0" ] && echo passed || echo "failed ($database_status)")"
echo "    full-ci: $([ "$ci_status" = "0" ] && echo passed || echo "failed ($ci_status)")"
echo "    full-e2e: $([ "$e2e_status" = "0" ] && echo passed || echo "failed ($e2e_status)")"
if [ "$database_status" != "0" ] || [ "$ci_status" != "0" ] || [ "$e2e_status" != "0" ]; then
  echo "[错误] CNB 公共发布门禁失败；已收集全部可执行检查结果，未构建或部署任何目标制品" >&2
  [ "$database_status" != "0" ] && exit "$database_status"
  [ "$ci_status" != "0" ] && exit "$ci_status"
  exit "$e2e_status"
fi

node ops/release-gate-receipt.mjs cnb-create \
  --source "$RELEASE_SOURCE_SHA" \
  --tree "$RELEASE_SOURCE_TREE" \
  --output "$RECEIPT_FILE"
node ops/release-gate-receipt.mjs cnb-verify \
  --source "$RELEASE_SOURCE_SHA" \
  --tree "$RELEASE_SOURCE_TREE" \
  --file "$RECEIPT_FILE"
echo "==> CNB 公共发布门禁通过：$RECEIPT_FILE"
