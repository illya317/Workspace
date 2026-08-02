#!/usr/bin/env bash
set -uo pipefail

if ! PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" \
  || ! cd "$PROJECT_ROOT"; then
  echo "[错误] 无法进入 deploy target adapter 根目录" >&2
  exit 1
fi

UNIT_ID="${DEPLOY_UNIT_ID:-}"
MODE="${DEPLOY_UNIT_MODE:-shadow}"
READY_TARGET_MODE="${DEPLOY_UNIT_MODE:-activate}"
ACTION="${RELEASE_ACTION:-deploy}"
CNB_RELEASE_ARTIFACT_RECEIPT_FILE="${CNB_RELEASE_ARTIFACT_RECEIPT_FILE:-$PWD/.cache/release-check/release-artifact.json}"
TARGET_ID="${UNIT_ID:-monolith}"
RELEASE_READY_RECEIPT_FILE="${RELEASE_READY_RECEIPT_FILE:-}"
RELEASE_CONFIGURATION_DIGEST="${RELEASE_CONFIGURATION_DIGEST:-}"
RELEASE_CI_RUN_ID="${RELEASE_CI_RUN_ID:-}"
RELEASE_CONTENT_DIGEST="${RELEASE_CONTENT_DIGEST:-}"
RELEASE_SOURCE_TREE="${RELEASE_SOURCE_TREE:-}"
RELEASE_SOURCE_SHA="${RELEASE_SOURCE_SHA:-}"
RELEASE_SOURCE_VALIDATION_RECEIPT_FILE="${RELEASE_SOURCE_VALIDATION_RECEIPT_FILE:-}"
RELEASE_SOURCE_RESULT_FILE="${RELEASE_SOURCE_RESULT_FILE:-}"
CHECK_TASK_GRAPH_FILE="${CHECK_TASK_GRAPH_FILE:-}"
RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE="${RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE:-}"
RELEASE_ARTIFACT_REHEARSAL_FILE="${RELEASE_ARTIFACT_REHEARSAL_FILE:-}"

preflight_failed=()
preflight_blocked=()
preflight_fail() { preflight_failed+=("$1"); }
preflight_block() { preflight_blocked+=("$1"); }

[ "$ACTION" = deploy ] || preflight_fail "input.action:旧 validate/build 动作已删除"
if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  preflight_fail "input.deploy-unit-id"
fi
case "$MODE" in
  shadow|prepare|activate) ;;
  *) preflight_fail "input.deploy-unit-mode" ;;
esac
for name in RELEASE_READY_RECEIPT_FILE RELEASE_CONFIGURATION_DIGEST RELEASE_CI_RUN_ID \
  RELEASE_CONTENT_DIGEST RELEASE_SOURCE_TREE RELEASE_SOURCE_SHA RELEASE_SOURCE_VALIDATION_RECEIPT_FILE \
  RELEASE_SOURCE_RESULT_FILE CHECK_TASK_GRAPH_FILE RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE \
  RELEASE_ARTIFACT_REHEARSAL_FILE; do
  [ -n "${!name:-}" ] || preflight_fail "input.$name"
done

artifact_inputs_ready=1
for value in "$RELEASE_CONTENT_DIGEST" "$RELEASE_SOURCE_TREE" "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"; do
  [ -n "$value" ] || artifact_inputs_ready=0
done
if [ "$artifact_inputs_ready" = 1 ]; then
  if ! node ops/release-gate-receipt.mjs artifact-verify \
    --content "$RELEASE_CONTENT_DIGEST" \
    --tree "$RELEASE_SOURCE_TREE" \
    --target "$TARGET_ID" --file "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"; then
    preflight_fail "artifact.receipt"
  fi
else
  preflight_block "artifact.receipt:input"
fi
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
  --target-mode "$READY_TARGET_MODE"
  --source-receipt "$RELEASE_SOURCE_VALIDATION_RECEIPT_FILE"
  --source-result "$RELEASE_SOURCE_RESULT_FILE"
  --task-graph "$CHECK_TASK_GRAPH_FILE"
  --artifact-preflight "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE"
  --rehearsal "$RELEASE_ARTIFACT_REHEARSAL_FILE"
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
  ready_inputs_ready=1
  for value in "$RELEASE_READY_RECEIPT_FILE" "$RELEASE_CI_RUN_ID" "$RELEASE_SOURCE_SHA" \
    "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST" "$RELEASE_CONFIGURATION_DIGEST"; do
    [ -n "$value" ] || ready_inputs_ready=0
  done
  if [ "$ready_inputs_ready" = 1 ]; then
    if node ops/release/readiness/ready-artifact.mjs verify "${ready_args[@]}" >/dev/null; then
      echo "==> Ready Receipt 与恢复后的 artifact 完全一致；允许进入生产安全阶段"
    else
      preflight_fail "application-ready.receipt"
    fi
  else
    preflight_block "application-ready.receipt:input"
  fi
fi

if [ "${#preflight_failed[@]}" -gt 0 ] || [ "${#preflight_blocked[@]}" -gt 0 ]; then
  echo "[错误] Deploy target adapter preflight 汇总: failed=${#preflight_failed[@]} blocked=${#preflight_blocked[@]}; production mutation=0" >&2
  for item in "${preflight_failed[@]}"; do echo "  failed: $item" >&2; done
  for item in "${preflight_blocked[@]}"; do echo "  blocked: $item" >&2; done
  exit 1
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
  deploy_status=$?
  if [ "$deploy_status" -ne 0 ]; then
    echo "[错误] Full deploy 失败: status=$deploy_status" >&2
    exit "$deploy_status"
  fi
  pin_production_artifact
  exit 0
fi

export DEPLOY_UNIT_TRUSTED_BUILD=1
bash ./ops/deploy-unit.sh deploy "$UNIT_ID" "$MODE"
deploy_status=$?
if [ "$deploy_status" -ne 0 ]; then
  echo "[错误] Unit deploy 失败: status=$deploy_status" >&2
  exit "$deploy_status"
fi
if [ "$MODE" = "activate" ]; then pin_production_artifact; fi
