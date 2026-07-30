#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
export ALLOW_CNB_RELEASE_INJECTION=1
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"
CLASSIFICATION_FILE="${RELEASE_CLASSIFICATION_FILE:-$PWD/.cache/release-check/affected-classification.json}"
CNB_RELEASE_GATE_RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
export CNB_RELEASE_GATE_RECEIPT_FILE

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  echo "==> 复用同一 base/source/tree 的已验证 release artifact，跳过构建"
  exit 0
fi
[ "$ACTION" = "validate" ] || { echo "[错误] deploy 只能消费已验证 artifact，禁止现场构建" >&2; exit 1; }

if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi
if [ -z "$UNIT_ID" ]; then
  if node -e 'const c=require(process.argv[1]); process.exit(c.runType ? 0 : 1)' "$CLASSIFICATION_FILE"; then
    STANDALONE_EXTERNAL_TYPECHECK=1 bash ./ops/build-standalone-artifact.sh
  else
    bash ./ops/build-standalone-artifact.sh
  fi
else
  if node -e 'const c=require(process.argv[1]); process.exit(c.runType ? 0 : 1)' "$CLASSIFICATION_FILE"; then
    DEPLOY_UNIT_SKIP_TYPECHECK=1 bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
  else
    bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
  fi
fi

env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  node scripts/ci/run-affected-validation.mjs --classification "$CLASSIFICATION_FILE" --phase post-build

node ops/release-gate-receipt.mjs cnb-create \
  --base "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}" \
  --source "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --runner "$RUNTIME" \
  --output "$CNB_RELEASE_GATE_RECEIPT_FILE"
bash ./ops/cnb-release-artifact-cache.sh store
echo "==> validate 完成：源码门禁、依赖闭包和 immutable artifact 已绑定"
