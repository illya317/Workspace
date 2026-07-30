#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}"

ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
CLASSIFICATION_FILE="${RELEASE_CLASSIFICATION_FILE:-$PWD/.cache/release-check/affected-classification.json}"
RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"

case "$ACTION" in
  validate|deploy) ;;
  *) echo "[错误] RELEASE_ACTION 只能是 validate 或 deploy" >&2; exit 2 ;;
esac
case "$RUNTIME" in
  cnb|local) ;;
  *) echo "[错误] RELEASE_VALIDATION_RUNTIME 只能是 cnb 或 local" >&2; exit 2 ;;
esac

if [ "$ACTION" = "deploy" ]; then
  bash ./ops/cnb-release-artifact-cache.sh restore
  node ops/release-gate-receipt.mjs cnb-verify \
    --base "$RELEASE_VALIDATION_BASE_SHA" --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" \
    --file "$RECEIPT_FILE"
  echo "==> 已恢复同一 base/source/tree 的验证制品；部署不再运行源码门禁"
  exit 0
fi

mkdir -p "$(dirname "$CLASSIFICATION_FILE")" "$(dirname "$RECEIPT_FILE")"
rm -f "$CLASSIFICATION_FILE" "$RECEIPT_FILE"
node scripts/ci/classify-risk.mjs \
  --base "$RELEASE_VALIDATION_BASE_SHA" \
  --head "$RELEASE_SOURCE_SHA" \
  --diff-mode two-dot \
  --event release-validation > "$CLASSIFICATION_FILE"

needs_database="$(node -e 'const c=require(process.argv[1]); process.stdout.write(String(c.runPostgresql || (c.runE2e && !process.env.DEPLOY_UNIT_ID)))' "$CLASSIFICATION_FILE")"

start_disposable_postgresql() {
  command -v pg_ctlcluster >/dev/null 2>&1 || {
    echo "[错误] CNB Builder 缺少 PostgreSQL cluster 工具" >&2
    return 1
  }
  local cluster_version cluster_name database_name database_exists
  read -r cluster_version cluster_name < <(pg_lsclusters --no-header | awk 'NR == 1 { print $1, $2 }')
  [ -n "$cluster_version" ] && [ -n "$cluster_name" ] || return 1
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
  for database_name in workspace_ci workspace_ci_shadow; do
    database_exists="$(runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname = '$database_name'")"
    [ "$database_exists" = "1" ] || runuser -u postgres -- createdb --owner=workspace "$database_name"
  done
}

if [ "$needs_database" = "true" ] && [ "$RUNTIME" = "cnb" ]; then
  echo "==> 启动受影响 PostgreSQL/E2E 所需的一次性数据库"
  start_disposable_postgresql
fi

echo "==> 按 Git base/head 与依赖闭包运行一次源码验证"
env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  node scripts/ci/run-affected-validation.mjs --classification "$CLASSIFICATION_FILE" --phase source
echo "==> 源码验证通过；制品构建与必要的选中 E2E 在下一阶段完成"
