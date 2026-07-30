#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
export ALLOW_CNB_RELEASE_INJECTION=1
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"
CNB_RELEASE_GATE_RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"

node ops/release-gate-receipt.mjs cnb-verify \
  --source "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --file "$CNB_RELEASE_GATE_RECEIPT_FILE"

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  echo "==> 复用已验证 CNB release artifact，跳过构建"
  exit 0
fi

if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi
if [ -z "$UNIT_ID" ]; then
  STANDALONE_SKIP_NEXT_BUILD=1 bash ./ops/build-standalone-artifact.sh
else
  bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
fi
bash ./ops/cnb-release-artifact-cache.sh store
