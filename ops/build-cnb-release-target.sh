#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
ACTION="${RELEASE_ACTION:-deploy}"
RUNTIME="${RELEASE_VALIDATION_RUNTIME:-cnb}"
TARGET_ID="${UNIT_ID:-monolith}"
export ALLOW_CNB_RELEASE_INJECTION=1
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"
CNB_RELEASE_ARTIFACT_RECEIPT_FILE="${CNB_RELEASE_ARTIFACT_RECEIPT_FILE:-$PWD/.cache/release-check/release-artifact.json}"
export CNB_RELEASE_ARTIFACT_RECEIPT_FILE

case "$ACTION" in
  validate)
    echo "==> validate 不运行 artifact 编译"
    exit 0
    ;;
  build|deploy) ;;
  *) echo "[错误] RELEASE_ACTION 只能是 validate、build 或 deploy" >&2; exit 2 ;;
esac

if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  echo "==> 复用同一候选内容的 immutable artifact；不重新编译"
  exit 0
fi
[ "$ACTION" = "build" ] || { echo "[错误] deploy 只能消费 build 环节冻结的 artifact，禁止现场编译" >&2; exit 1; }
node ops/cache/cache-prune.mjs assert-build-space --root "${RELEASE_SOURCE_DIR:-$PROJECT_ROOT}"

echo "==> 编译一次冻结候选 artifact"
set +e
if [ -z "$UNIT_ID" ]; then
  STANDALONE_EXTERNAL_TYPECHECK=1 bash ./ops/build-standalone-artifact.sh
else
  DEPLOY_UNIT_SKIP_TYPECHECK=1 bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
fi
build_status=$?
set -e

[ "$build_status" = "0" ] || { echo "[错误] build 失败；该 Plan 的 build 已终止，不自动重跑" >&2; exit "$build_status"; }

mkdir -p "$(dirname "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE")"
node ops/release-gate-receipt.mjs artifact-create \
  --content "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}" \
  --tree "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}" \
  --target "$TARGET_ID" --runner "$RUNTIME" \
  --output "$CNB_RELEASE_ARTIFACT_RECEIPT_FILE"
bash ./ops/cnb-release-artifact-cache.sh store
echo "==> build 完成：artifact 与候选内容回执已冻结；deploy 只能消费该制品"
