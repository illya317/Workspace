#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

UNIT_ID="${DEPLOY_UNIT_ID:-}"
export ALLOW_CNB_RELEASE_INJECTION=1
export WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-$PWD/scripts/check/fixtures/tenant-workspace}"

cache_hit_marker="${CNB_RELEASE_ARTIFACT_HIT_MARKER:-.cache/release-artifact-cache-hit}"
cache_target="${UNIT_ID:-monolith}"
if [ -f "$cache_hit_marker" ] \
  && [ "$(cat "$cache_hit_marker")" = "$cache_target:${RELEASE_SOURCE_SHA:-}:$RELEASE_SOURCE_TREE" ]; then
  echo "==> 复用已验证 CNB release artifact，跳过构建"
  exit 0
fi

if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] DEPLOY_UNIT_ID 无效: $UNIT_ID" >&2
  exit 2
fi
if [ -z "$UNIT_ID" ]; then
  bash ./ops/build-standalone-artifact.sh
else
  bash ./ops/build-deploy-unit-artifact.sh "$UNIT_ID"
fi
bash ./ops/cnb-release-artifact-cache.sh store
