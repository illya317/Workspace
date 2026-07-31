#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"

ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
EVIDENCE_ROOT="${RELEASE_EVIDENCE_ROOT:-$PWD/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST}"
RECEIPT_FILE="${RELEASE_SOURCE_VALIDATION_RECEIPT_FILE:-$EVIDENCE_ROOT/source-validation.json}"
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$EVIDENCE_ROOT/full-source-result.json}"

case "$ACTION" in
  validate|build|deploy) ;;
  *) echo "[错误] RELEASE_ACTION 只能是 validate、build 或 deploy" >&2; exit 2 ;;
esac

if [ "$ACTION" != "validate" ]; then
  echo "==> $ACTION 不运行源码验证；已完成环节只消费进度回执"
  exit 0
fi

mkdir -p "$EVIDENCE_ROOT"
if node ops/release-gate-receipt.mjs source-verify \
  --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
  --file "$RECEIPT_FILE" >/dev/null 2>&1; then
  echo "==> 复用同一候选内容的源码验证回执；不重新运行 CI"
  exit 0
fi

validation_args=(
  --content "$RELEASE_CONTENT_DIGEST"
  --result-file "$SOURCE_RESULT_FILE"
)
if [ "${RELEASE_ACKNOWLEDGE_FULL_CI_REPEAT:-0}" = "1" ]; then
  validation_args+=(--acknowledge-repeat)
fi

echo "==> 对冻结候选运行一次全量源码 CI；本环节不会触发编译"
set +e
env -u RELEASE_TIMING_FILE -u RELEASE_TIMING_RELEASE_ID \
  node ops/release/validation/full-source-validation.mjs "${validation_args[@]}"
source_status=$?
set -e
[ -f "$SOURCE_RESULT_FILE" ] || { echo "[错误] 全量源码 CI 未生成结果" >&2; exit 1; }
[ "$source_status" = "0" ] || { echo "[错误] 源码验证失败；该 Plan 的 validate 已终止，不自动重跑或进入 build" >&2; exit "$source_status"; }
node ops/release-gate-receipt.mjs source-create \
  --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
  --runner "$RUNTIME" --output "$RECEIPT_FILE"
echo "==> validate 完成：源码 CI 回执已冻结，后续 build/deploy 不再运行本环节"
