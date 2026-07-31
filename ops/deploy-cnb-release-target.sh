#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
MODE="${DEPLOY_UNIT_MODE:-shadow}"
ACTION="${RELEASE_ACTION:-deploy}"
CNB_RELEASE_ARTIFACT_RECEIPT_FILE="${CNB_RELEASE_ARTIFACT_RECEIPT_FILE:-$PWD/.cache/release-check/release-artifact.json}"
TARGET_ID="${UNIT_ID:-monolith}"
if [ "$ACTION" != "deploy" ]; then
  case "$ACTION" in validate|build) ;; *) echo "[错误] RELEASE_ACTION 无效" >&2; exit 2 ;; esac
  echo "==> $ACTION 不连接生产服务器"
  exit 0
fi
node ops/release-gate-receipt.mjs artifact-verify \
  --content "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --target "$TARGET_ID" --file "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"
pin_production_artifact() {
  if ! node ops/cache/cache-prune.mjs pin \
    --root "${RELEASE_SOURCE_DIR:-$PROJECT_ROOT}" \
    --target "$TARGET_ID" \
    --content "$RELEASE_CONTENT_DIGEST"; then
    echo "[警告] 生产部署已成功，但 artifact pin 写入失败；禁止在修复 pin 前清理 release cache。" >&2
  fi
}

if [ -z "$UNIT_ID" ]; then
  export RELEASE_DEPLOY_GRAPH_FILE="${STANDALONE_DEPLOY_GRAPH_PATH:-$PWD/.cache/release-check/deploy-graph.json}"
  bash ./ops/deploy.sh
  pin_production_artifact
  exit 0
fi
if [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi
case "$MODE" in
  shadow|prepare|activate) ;;
  *) echo "[错误] DEPLOY_UNIT_MODE 只能是 shadow、prepare 或 activate" >&2; exit 2 ;;
esac

export DEPLOY_UNIT_TRUSTED_BUILD=1
bash ./ops/deploy-unit.sh deploy "$UNIT_ID" "$MODE"
[ "$MODE" != "activate" ] || pin_production_artifact
