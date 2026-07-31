#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"

ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
EVIDENCE_ROOT="${RELEASE_EVIDENCE_ROOT:-$PWD/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST}"
RECEIPT_FILE="${RELEASE_SOURCE_VALIDATION_RECEIPT_FILE:-$EVIDENCE_ROOT/source-validation.json}"
plan_values="$(node - <<'NODE'
const fs = require('node:fs');
const metadata = JSON.parse(fs.readFileSync('.cnb-release.json', 'utf8'));
const plan = metadata.releasePlan?.plan;
if (!/^plan-[A-Za-z0-9-]+$/.test(plan?.planId ?? '')) throw new Error('release metadata must contain a Plan id');
if (!['standard', 'fast'].includes(plan?.mode)) throw new Error('release metadata must contain a Plan mode');
process.stdout.write(`${plan.planId}\n${plan.mode}\n`);
NODE
)"
CHECK_SOURCE_PLAN_ID="${CHECK_SOURCE_PLAN_ID:-$(printf '%s\n' "$plan_values" | sed -n '1p')}"
CHECK_RELEASE_MODE="${CHECK_RELEASE_MODE:-$(printf '%s\n' "$plan_values" | sed -n '2p')}"
CHECK_TASK_GRAPH_FILE="${CHECK_TASK_GRAPH_FILE:-$EVIDENCE_ROOT/task-graph-$CHECK_SOURCE_PLAN_ID.json}"
SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-$EVIDENCE_ROOT/full-source-result-$CHECK_SOURCE_PLAN_ID.json}"
export CHECK_SOURCE_PLAN_ID CHECK_RELEASE_MODE CHECK_TASK_GRAPH_FILE

case "$ACTION" in
  validate|build|deploy) ;;
  *) echo "[错误] RELEASE_ACTION 只能是 validate、build 或 deploy" >&2; exit 2 ;;
esac

if [ "$ACTION" != "validate" ]; then
  echo "==> $ACTION 不运行源码验证；已完成环节只消费进度回执"
  exit 0
fi

mkdir -p "$EVIDENCE_ROOT"

validation_args=(
  --content "$RELEASE_CONTENT_DIGEST"
  --result-file "$SOURCE_RESULT_FILE"
  --plan-id "$CHECK_SOURCE_PLAN_ID"
  --task-graph "$CHECK_TASK_GRAPH_FILE"
)

echo "==> 先冻结任务级输入图，再组合历史有效回执与本次检查；本环节不会触发编译"
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
