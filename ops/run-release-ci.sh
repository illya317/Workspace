#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
: "${RELEASE_CONFIGURATION_DIGEST:?RELEASE_CONFIGURATION_DIGEST is required}"
: "${RELEASE_CI_ENV_FILE:?RELEASE_CI_ENV_FILE is required}"
[ -f "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] CI 环境文件不存在: $RELEASE_CI_ENV_FILE" >&2; exit 1; }
[ -z "$(git -C "$SOURCE_DIR" status --short)" ] || { echo "[错误] CI 只接受干净 release tree" >&2; exit 1; }
[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$RELEASE_SOURCE_SHA" ] || { echo "[错误] CI source 已漂移" >&2; exit 1; }

set -a
# shellcheck source=/dev/null
source "$RELEASE_CI_ENV_FILE"
set +a
export CI=1 WORKSPACE_CONFIG_DIR
TARGET_ID="${DEPLOY_UNIT_ID:-monolith}"
TARGET_MODE="${DEPLOY_UNIT_MODE:-activate}"
PREFLIGHT_STATUS="${RELEASE_CI_PREFLIGHT_STATUS:-0}"
printf -v CI_RUN_NONCE '%04x%04x' "$RANDOM" "$RANDOM"
CI_RUN_ID="ci-$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_CONTENT_DIGEST:0:12}-$CI_RUN_NONCE"
EVIDENCE_ROOT="$SOURCE_DIR/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST"
READY_ROOT="$SOURCE_DIR/.cache/release-ready"
SOURCE_RECEIPT="$EVIDENCE_ROOT/source-validation.json"
ARTIFACT_RECEIPT="$SOURCE_DIR/.cache/release-check/release-artifact.json"
TASK_GRAPH="$SOURCE_DIR/.cache/release-task-graphs/$CI_RUN_ID.json"
SOURCE_RESULT="$EVIDENCE_ROOT/source-$CI_RUN_ID.json"
mkdir -p "$EVIDENCE_ROOT" "$READY_ROOT/receipts" "$(dirname "$TASK_GRAPH")" "$(dirname "$ARTIFACT_RECEIPT")"

cd "$SOURCE_DIR"
export CHECK_SOURCE_RUN_ID="$CI_RUN_ID"
export CHECK_TASK_GRAPH_FILE="$TASK_GRAPH"
export RELEASE_EVIDENCE_ROOT="$EVIDENCE_ROOT"
export RELEASE_SOURCE_VALIDATION_RECEIPT_FILE="$SOURCE_RECEIPT"
export RELEASE_SOURCE_RESULT_FILE="$SOURCE_RESULT"
export RELEASE_VALIDATION_RUNTIME=local
export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$SOURCE_DIR/.cache/release-artifacts"
export CNB_RELEASE_ARTIFACT_RECEIPT_FILE="$ARTIFACT_RECEIPT"

echo "==> CI ${CI_RUN_ID}：先聚合运行全部源码检查；单项失败不终止其他独立检查"
set +e
bash "$SCRIPT_DIR/run-cnb-release-gate.sh"
source_status=$?
echo "==> CI ${CI_RUN_ID}：继续独立构建目标 artifact，以同一轮暴露构建/组装问题"
bash "$SCRIPT_DIR/build-cnb-release-target.sh"
artifact_status=$?
set -e

if [ "$TARGET_ID" = monolith ]; then
  ARTIFACT_FILE="$SOURCE_DIR/.next/workspace-standalone.tgz"
  MANIFEST_FILE="$SOURCE_DIR/.next/workspace-standalone.manifest.json"
  CONTRACT_ARGS=()
else
  ARTIFACT_FILE="$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/$TARGET_ID-standalone.tgz"
  MANIFEST_FILE="$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/$TARGET_ID-standalone.manifest.json"
  CONTRACT_ARGS=(--contract "$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/deploy-unit-contract.json")
fi
REHEARSAL_FILE="$EVIDENCE_ROOT/rehearsal-$TARGET_ID-$RELEASE_CONFIGURATION_DIGEST.json"
if [ "$artifact_status" -eq 0 ]; then
  set +e
  node "$SCRIPT_DIR/release/readiness/rehearse-artifact.mjs" \
    --repository "$SOURCE_DIR" --output "$REHEARSAL_FILE" \
    --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" --content "$RELEASE_CONTENT_DIGEST" \
    --configuration "$RELEASE_CONFIGURATION_DIGEST" --target "$TARGET_ID" --target-mode "$TARGET_MODE" \
    --artifact "$ARTIFACT_FILE" --manifest "$MANIFEST_FILE"
  rehearsal_status=$?
  set -e
else
  rehearsal_status=2
  echo "[CI] artifact 启动演练 blocked：artifact 未成功构建或恢复" >&2
fi

if [ "$PREFLIGHT_STATUS" -ne 0 ] || [ "$source_status" -ne 0 ] || [ "$artifact_status" -ne 0 ] || [ "$rehearsal_status" -ne 0 ]; then
  echo "" >&2
  echo "[CI 汇总] preflight=$PREFLIGHT_STATUS source=$source_status artifact=$artifact_status rehearsal=${rehearsal_status}；未签发 Ready Artifact" >&2
  echo "[CI 汇总] 修复完整清单后再次运行 ci；精确输入未变化的成功任务会直接复用。" >&2
  exit 1
fi

READY_FILE="$READY_ROOT/receipts/$TARGET_ID-$RELEASE_CONTENT_DIGEST-$RELEASE_CONFIGURATION_DIGEST.json"
node "$SCRIPT_DIR/release/readiness/ready-artifact.mjs" create \
  --root "$READY_ROOT" \
  --output "$READY_FILE" \
  --repository "$SOURCE_DIR" \
  --run-id "$CI_RUN_ID" \
  --source "$RELEASE_SOURCE_SHA" \
  --tree "$RELEASE_SOURCE_TREE" \
  --content "$RELEASE_CONTENT_DIGEST" \
  --configuration "$RELEASE_CONFIGURATION_DIGEST" \
  --target "$TARGET_ID" \
  --target-mode "$TARGET_MODE" \
  --artifact "$ARTIFACT_FILE" \
  --manifest "$MANIFEST_FILE" \
  --source-receipt "$SOURCE_RECEIPT" \
  --source-result "$SOURCE_RESULT" \
  --task-graph "$TASK_GRAPH" \
  --rehearsal "$REHEARSAL_FILE" \
  --artifact-receipt "$ARTIFACT_RECEIPT" \
  "${CONTRACT_ARGS[@]}"

echo "==> READY: $TARGET_ID ${RELEASE_SOURCE_SHA:0:12} content=${RELEASE_CONTENT_DIGEST:0:12}"
echo "==> deploy 现在只会消费这个 Ready Artifact，不再运行检查或构建。"
