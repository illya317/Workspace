#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
MODE="${DEPLOY_UNIT_MODE:-shadow}"
ACTION="${RELEASE_ACTION:-deploy}"
CNB_RELEASE_GATE_RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
if [ "$ACTION" = "validate" ]; then
  echo "==> validate-only：制品已生成并缓存，不连接生产服务器"
  exit 0
fi
[ "$ACTION" = "deploy" ] || { echo "[错误] RELEASE_ACTION 只能是 validate 或 deploy" >&2; exit 2; }
node ops/release-gate-receipt.mjs cnb-verify \
  --base "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}" \
  --source "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --file "$CNB_RELEASE_GATE_RECEIPT_FILE"
if [ -z "$UNIT_ID" ]; then
  export RELEASE_DEPLOY_GRAPH_FILE="${STANDALONE_DEPLOY_GRAPH_PATH:-$PWD/.cache/release-check/deploy-graph.json}"
  exec bash ./ops/deploy.sh
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
exec bash ./ops/deploy-unit.sh deploy "$UNIT_ID" "$MODE"
