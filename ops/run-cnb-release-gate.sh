#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
: "${CHECK_SOURCE_RUN_ID:?CHECK_SOURCE_RUN_ID is required}"

RUNTIME="${RELEASE_VALIDATION_RUNTIME:-local}"
TARGET_ID="${DEPLOY_UNIT_ID:-monolith}"
EVIDENCE_ROOT="${RELEASE_EVIDENCE_ROOT:-$PWD/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST}"
RECEIPT_FILE="${RELEASE_SOURCE_VALIDATION_RECEIPT_FILE:-$EVIDENCE_ROOT/source-validation-$TARGET_ID-$CHECK_SOURCE_RUN_ID.json}"
CHECK_TASK_GRAPH_FILE="${CHECK_TASK_GRAPH_FILE:-$EVIDENCE_ROOT/task-graph-$CHECK_SOURCE_RUN_ID.json}"
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$EVIDENCE_ROOT/source-$CHECK_SOURCE_RUN_ID.json}"
export CHECK_SOURCE_RUN_ID CHECK_TASK_GRAPH_FILE

mkdir -p "$EVIDENCE_ROOT"

validation_args=(
  --content "$RELEASE_CONTENT_DIGEST"
  --result-file "$SOURCE_RESULT_FILE"
  --run-id "$CHECK_SOURCE_RUN_ID"
  --target "$TARGET_ID"
  --task-graph "$CHECK_TASK_GRAPH_FILE"
)

echo "==> 冻结本次 CI 任务输入图；聚合运行全部独立检查，成功精确输入复用历史回执"
set +e
env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  node ops/release/validation/full-source-validation.mjs "${validation_args[@]}"
source_status=$?
set -e
[ -f "$SOURCE_RESULT_FILE" ] || { echo "[错误] 聚合源码 CI 未生成结果" >&2; exit 1; }
[ "$source_status" = "0" ] || { echo "[错误] 聚合源码 CI 失败；完整失败清单见上方汇总" >&2; exit "$source_status"; }
node ops/release-gate-receipt.mjs source-create \
  --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
  --runner "$RUNTIME" --target "$TARGET_ID" --run-id "$CHECK_SOURCE_RUN_ID" --output "$RECEIPT_FILE"
echo "==> 源码证明完成；artifact 构建是同一次 ci 的独立任务"
