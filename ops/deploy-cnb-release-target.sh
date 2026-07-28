#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
MODE="${DEPLOY_UNIT_MODE:-shadow}"
CNB_RELEASE_GATE_RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
node ops/release-gate-receipt.mjs cnb-verify \
  --source "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --file "$CNB_RELEASE_GATE_RECEIPT_FILE"
if [ -z "$UNIT_ID" ]; then
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
