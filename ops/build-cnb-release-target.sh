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
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$PWD/.cache/release-check/affected-source-result.json}"
POST_BUILD_RESULT_FILE="${RELEASE_POST_BUILD_RESULT_FILE:-$PWD/.cache/release-check/affected-post-build-result.json}"
export CNB_RELEASE_GATE_RECEIPT_FILE

source_status=""
if [ "$ACTION" = "validate" ]; then
  [ -f "$SOURCE_RESULT_FILE" ] || { echo "[错误] 缺少源码门禁完整结果: $SOURCE_RESULT_FILE" >&2; exit 1; }
  source_status="$(node -e 'const value=require(process.argv[1]); const status=value?.result?.status; if(!Number.isInteger(status)) process.exit(2); process.stdout.write(String(status))' "$SOURCE_RESULT_FILE")"
fi

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  if [ "$ACTION" = "validate" ] && [ "$source_status" != "0" ]; then
    echo "==> validate 全阶段结果"
    echo "    source: failed ($source_status)"
    echo "    artifact-build/post-build: passed (reused exact artifact evidence)"
    echo "[错误] 本次源码门禁失败；缓存 artifact 不得掩盖失败" >&2
    exit "$source_status"
  fi
  echo "==> 复用同一 base/source/tree 的已验证 release artifact，跳过构建"
  exit 0
fi
[ "$ACTION" = "validate" ] || { echo "[错误] deploy 只能消费已验证 artifact，禁止现场构建" >&2; exit 1; }

rm -f "$POST_BUILD_RESULT_FILE"
build_status=0
post_build_status=0
if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi
set +e
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
build_status=$?
set -e

if [ "$build_status" = "0" ]; then
  set +e
  env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
    node scripts/ci/run-affected-validation.mjs \
      --classification "$CLASSIFICATION_FILE" --phase post-build --result-file "$POST_BUILD_RESULT_FILE"
  post_build_status=$?
  set -e
  [ -f "$POST_BUILD_RESULT_FILE" ] || post_build_status=1
else
  post_build_status=92
fi

echo "==> validate 全阶段结果"
echo "    source: $([ "$source_status" = "0" ] && echo passed || echo "failed ($source_status)")"
echo "    artifact-build: $([ "$build_status" = "0" ] && echo passed || echo "failed ($build_status)")"
if [ "$build_status" != "0" ]; then
  echo "    post-build/E2E: blocked by artifact-build"
else
  echo "    post-build/E2E: $([ "$post_build_status" = "0" ] && echo passed || echo "failed ($post_build_status)")"
fi
if [ "$source_status" != "0" ] || [ "$build_status" != "0" ] || [ "$post_build_status" != "0" ]; then
  echo "[错误] validate 失败；已收集全部可执行检查结果，未生成发布回执或可部署 artifact" >&2
  [ "$source_status" != "0" ] && exit "$source_status"
  [ "$build_status" != "0" ] && exit "$build_status"
  exit "$post_build_status"
fi

node ops/release-gate-receipt.mjs cnb-create \
  --base "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required}" \
  --source "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --runner "$RUNTIME" \
  --output "$CNB_RELEASE_GATE_RECEIPT_FILE"
bash ./ops/cnb-release-artifact-cache.sh store
echo "==> validate 完成：源码门禁、依赖闭包和 immutable artifact 已绑定"
