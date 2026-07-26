#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ROLLOUT_FILE="${1:-}"
if [ "$#" -ne 1 ] || [ ! -f "$ROLLOUT_FILE" ]; then
  echo "用法: $0 <deployment-profile-rollout.json>" >&2
  exit 2
fi
[ -n "${REMOTE_DIR:-}" ] && [ "${REMOTE_DIR#/}" != "$REMOTE_DIR" ] || {
  echo "[错误] REMOTE_DIR 必须是绝对路径" >&2
  exit 1
}
[ "${DEPLOY_UNIT_TRUSTED_BUILD:-0}" = "1" ] || {
  echo "[错误] Profile prepare 只接受可信发布流水线产物" >&2
  exit 1
}

node ops/deployment-profile-rollout.mjs assert "$ROLLOUT_FILE" >/dev/null
ROLLOUT_SHA="$(node ops/deployment-profile-rollout.mjs digest "$ROLLOUT_FILE")"
PREPARED_STATE_ROOT="${DEPLOY_PROFILE_PREPARED_STATE_ROOT:-$REMOTE_DIR/.workspace/gateway/profile-preparations/$ROLLOUT_SHA}"
[ "${PREPARED_STATE_ROOT#/}" != "$PREPARED_STATE_ROOT" ] || {
  echo "[错误] DEPLOY_PROFILE_PREPARED_STATE_ROOT 必须是绝对路径" >&2
  exit 1
}

target_count=0
while IFS= read -r unit_id; do
  [ -n "$unit_id" ] || continue
  target_count=$((target_count + 1))
  DEPLOY_PROFILE_PREPARED_STATE_ROOT="$PREPARED_STATE_ROOT" \
    bash ops/deploy-unit.sh deploy "$unit_id" prepare
done < <(node ops/deployment-profile-rollout.mjs targets "$ROLLOUT_FILE")

if [ "$target_count" -eq 0 ]; then
  echo "Profile rollout 无目标 unit；无需 prepare"
else
  echo "Profile prepared state root: $PREPARED_STATE_ROOT"
fi
