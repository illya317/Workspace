#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
MODE="${DEPLOY_UNIT_MODE:-shadow}"
ACTION="${RELEASE_ACTION:-deploy}"
CNB_RELEASE_ARTIFACT_RECEIPT_FILE="${CNB_RELEASE_ARTIFACT_RECEIPT_FILE:-$PWD/.cache/release-check/release-artifact.json}"
TARGET_ID="${UNIT_ID:-monolith}"
: "${RELEASE_READY_RECEIPT_FILE:?deploy requires RELEASE_READY_RECEIPT_FILE}"
: "${RELEASE_CONFIGURATION_DIGEST:?deploy requires RELEASE_CONFIGURATION_DIGEST}"
: "${RELEASE_CI_RUN_ID:?deploy requires RELEASE_CI_RUN_ID}"
[ "$ACTION" = deploy ] || { echo "[错误] deploy target 只消费 Ready Artifact；旧 validate/build 动作已删除" >&2; exit 2; }
node ops/release-gate-receipt.mjs artifact-verify \
  --content "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --target "$TARGET_ID" --file "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"
ready_args=(
  --file "$RELEASE_READY_RECEIPT_FILE"
  --repository "$PWD"
  --proof-root "${RELEASE_PROOF_ROOT:-$PWD}"
  --run-id "$RELEASE_CI_RUN_ID"
  --source "$RELEASE_SOURCE_SHA"
  --tree "$RELEASE_SOURCE_TREE"
  --content "$RELEASE_CONTENT_DIGEST"
  --configuration "$RELEASE_CONFIGURATION_DIGEST"
  --target "$TARGET_ID"
  --target-mode "${DEPLOY_UNIT_MODE:-activate}"
  --source-receipt "${RELEASE_SOURCE_VALIDATION_RECEIPT_FILE:?source validation receipt is required}"
  --source-result "${RELEASE_SOURCE_RESULT_FILE:?aggregate source result is required}"
  --task-graph "${CHECK_TASK_GRAPH_FILE:?frozen task graph is required}"
  --rehearsal "${RELEASE_ARTIFACT_REHEARSAL_FILE:?artifact rehearsal receipt is required}"
  --artifact-receipt "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"
)
if [ -z "$UNIT_ID" ]; then
  ready_args+=(
    --artifact "${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
    --manifest "${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
  )
else
  output_root="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
  ready_args+=(
    --artifact "$output_root/$UNIT_ID-standalone.tgz"
    --manifest "$output_root/$UNIT_ID-standalone.manifest.json"
    --contract "$output_root/deploy-unit-contract.json"
  )
fi
if [ "${RELEASE_READY_VERIFIED:-0}" = 1 ]; then
  echo "==> Ready Receipt 已在同一进程的生产 preflight 前复验；hardlink identity 未变化"
else
  node ops/release/readiness/ready-artifact.mjs verify "${ready_args[@]}" >/dev/null
  echo "==> Ready Receipt 与恢复后的 artifact 完全一致；允许进入生产安全阶段"
fi
pin_production_artifact() {
  if ! node ops/cache/cache-prune.mjs pin \
    --root "${RELEASE_SOURCE_DIR:-$PROJECT_ROOT}" \
    --target "$TARGET_ID" \
    --content "$RELEASE_CONTENT_DIGEST"; then
    echo "[警告] 生产部署已成功，但 artifact pin 写入失败；禁止在修复 pin 前清理 release cache。" >&2
  fi
}

if [ -z "$UNIT_ID" ]; then
  export RELEASE_DEPLOY_GRAPH_FILE="${STANDALONE_DEPLOY_GRAPH_PATH:-$PWD/.cache/release-check/deploy-graph.json}"
  bash ./ops/deploy.sh
  pin_production_artifact
  exit 0
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
bash ./ops/deploy-unit.sh deploy "$UNIT_ID" "$MODE"
[ "$MODE" != "activate" ] || pin_production_artifact
