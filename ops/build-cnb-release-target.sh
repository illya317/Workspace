#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
export ALLOW_CNB_RELEASE_INJECTION=1
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"
CNB_RELEASE_GATE_RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$PWD/.cache/release-check/full-source-result.json}"
export CNB_RELEASE_GATE_RECEIPT_FILE

source_status=""
if [ "$ACTION" = "validate" ]; then
  [ -f "$SOURCE_RESULT_FILE" ] || { echo "[错误] 缺少全量源码 CI 结果: $SOURCE_RESULT_FILE" >&2; exit 1; }
  source_status="$(node -e 'const value=require(process.argv[1]); const status=value?.exitCode; if(!Number.isInteger(status)) process.exit(2); process.stdout.write(String(status))' "$SOURCE_RESULT_FILE")"
fi

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  if [ "$ACTION" = "validate" ] && [ "$source_status" != "0" ]; then
    echo "==> validate 全阶段结果"
    echo "    full-source-ci: failed ($source_status)"
    echo "    artifact-compile: passed (reused content-addressed artifact)"
    echo "[错误] 本次源码 CI 失败；缓存 artifact 不得掩盖失败" >&2
    exit "$source_status"
  fi
  echo "==> 复用同一候选内容的已验证 artifact，跳过编译"
  exit 0
fi
[ "$ACTION" = "validate" ] || { echo "[错误] deploy 只能消费已验证 artifact，禁止现场编译" >&2; exit 1; }

if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi

echo "==> 编译一次冻结候选 artifact"
set +e
if [ -z "$UNIT_ID" ]; then
  STANDALONE_EXTERNAL_TYPECHECK=1 bash ./ops/build-standalone-artifact.sh
else
  DEPLOY_UNIT_SKIP_TYPECHECK=1 bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
fi
build_status=$?
set -e

echo "==> validate 全阶段结果"
echo "    full-source-ci: $([ "$source_status" = "0" ] && echo passed || echo "failed ($source_status)")"
echo "    artifact-compile: $([ "$build_status" = "0" ] && echo passed || echo "failed ($build_status)")"
if [ "$source_status" != "0" ] || [ "$build_status" != "0" ]; then
  echo "[错误] validate 失败；未生成发布回执或可部署 artifact" >&2
  [ "$source_status" != "0" ] && exit "$source_status"
  exit "$build_status"
fi

node ops/release-gate-receipt.mjs cnb-create \
  --content "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --runner "$RUNTIME" \
  --output "$CNB_RELEASE_GATE_RECEIPT_FILE"
bash ./ops/cnb-release-artifact-cache.sh store
echo "==> validate 完成：一次全量源码 CI、一次 artifact 编译与内容回执已绑定"
