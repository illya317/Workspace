#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"

ACTION="${RELEASE_ACTION:-deploy}"
RECEIPT_FILE="${CNB_RELEASE_GATE_RECEIPT_FILE:-$PWD/.cache/release-check/cnb-release-gate.json}"
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$PWD/.cache/release-check/full-source-result.json}"

case "$ACTION" in
  validate|deploy) ;;
  *) echo "[错误] RELEASE_ACTION 只能是 validate 或 deploy" >&2; exit 2 ;;
esac

if [ "$ACTION" = "deploy" ]; then
  bash ./ops/cnb-release-artifact-cache.sh restore
  node ops/release-gate-receipt.mjs cnb-verify \
    --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
    --file "$RECEIPT_FILE"
  echo "==> 已恢复同一候选内容的验证制品；deploy 不运行源码门禁或编译"
  exit 0
fi

mkdir -p "$(dirname "$SOURCE_RESULT_FILE")"
validation_args=(
  --content "$RELEASE_CONTENT_DIGEST"
  --result-file "$SOURCE_RESULT_FILE"
)
if [ "${RELEASE_ACKNOWLEDGE_FULL_CI_REPEAT:-0}" = "1" ]; then
  validation_args+=(--acknowledge-repeat)
fi

echo "==> 对冻结候选运行一次全量源码 CI；不做风险分类或自动扩缩门禁"
set +e
env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  node ops/release/validation/full-source-validation.mjs "${validation_args[@]}"
source_status=$?
set -e
[ -f "$SOURCE_RESULT_FILE" ] || { echo "[错误] 全量源码 CI 未生成结果" >&2; exit 1; }
if [ "$source_status" = "0" ]; then
  echo "==> 全量源码 CI 通过；下一阶段只编译一次目标 artifact"
else
  echo "[错误] 全量源码 CI 失败；仍进入一次独立编译以完整收集本轮问题，最终不会生成部署回执" >&2
fi

# The artifact stage reads the result and produces the aggregate exit status.
exit 0
