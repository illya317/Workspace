#!/usr/bin/env bash

record_release_event() {
  local status="$1" exit_code="${2:-0}"
  [ "$PRINT_COMMAND_ONLY" = 0 ] || return 0
  [ "$status" = running ] || [ "$RELEASE_TERMINAL_EVENT_RECORDED" = 0 ] || return 0
  [ -n "${SERVER_READ_KEY:-}" ] && [ -f "$SERVER_READ_KEY" ] || return 0
  [ -n "${SOURCE_SHA:-}" ] && [ -f "${DEPLOY_TIMING_STATE_FILE:-}" ] \
    && [ -n "${RELEASE_PLAN_ID:-}" ] && [ -n "${RELEASE_PROCESS_STARTED_AT:-}" ] || return 0
  if [ "$status" = running ]; then
    (set -o noclobber; : > "$TMP_DIR/.deploy-slow-notice-recorded") 2>/dev/null || return 0
  elif [ -n "${DEPLOY_SLOW_NOTICE_PID:-}" ]; then
    kill "$DEPLOY_SLOW_NOTICE_PID" >/dev/null 2>&1 || true
    wait "$DEPLOY_SLOW_NOTICE_PID" >/dev/null 2>&1 || true
    DEPLOY_SLOW_NOTICE_PID=""
  fi
  local values requested_epoch requested_at mutation_epoch mutation_at phase finished_epoch finished_at total mutation=""
  values="$(node "$SCRIPT_DIR/release/diagnostics/deploy-timing-state.mjs" lines --file "$DEPLOY_TIMING_STATE_FILE")" || return 1
  requested_epoch="$(printf '%s\n' "$values" | sed -n '1p')"
  requested_at="$(printf '%s\n' "$values" | sed -n '2p')"
  mutation_epoch="$(printf '%s\n' "$values" | sed -n '3p')"
  mutation_at="$(printf '%s\n' "$values" | sed -n '4p')"
  phase="$(printf '%s\n' "$values" | sed -n '5p')"
  finished_epoch="$(date +%s)"
  finished_at="$(date -u --date="@$finished_epoch" +%Y-%m-%dT%H:%M:%S.000Z)"
  total="$((finished_epoch - requested_epoch))"; [ "$total" -ge 0 ] || total=0
  if [ -n "$mutation_epoch" ]; then mutation="$((finished_epoch - mutation_epoch))"; [ "$mutation" -ge 0 ] || mutation=0; fi
  local slow=0; [ "$status" != running ] || slow=1
  if ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "REMOTE_DIR='$REMOTE_DIR' DEPLOY_TRANSPORT='$RELEASE_TRANSPORT' DEPLOY_SOURCE_SHA='$SOURCE_SHA' DEPLOY_CONTROL_SOURCE_SHA='$DEPLOY_CONTROL_SOURCE_SHA' DEPLOY_CONTROL_TREE_ID='$DEPLOY_CONTROL_TREE_ID' DEPLOY_CONTROL_DIGEST='$DEPLOY_CONTROL_DIGEST' RELEASE_PLAN_ID='$RELEASE_PLAN_ID' RELEASE_STAGE='$RELEASE_ACTION' RELEASE_PROCESS_STARTED_AT='$RELEASE_PROCESS_STARTED_AT' DEPLOY_REQUESTED_AT='$requested_at' DEPLOY_MUTATION_STARTED_AT='$mutation_at' DEPLOY_FINISHED_AT='$finished_at' DEPLOY_END_TO_END_DURATION_SECONDS='$total' DEPLOY_MUTATION_DURATION_SECONDS='$mutation' DEPLOY_CURRENT_PHASE='$phase' DEPLOY_TARGET_ID='${DEPLOY_UNIT_ID:-monolith}' DEPLOY_TARGET_MODE='${DEPLOY_UNIT_MODE:-activate}' DEPLOY_SOFT_THRESHOLD_EXCEEDED='$slow' DEPLOY_STATUS='$status' DEPLOY_EXIT_CODE='$exit_code' python3 -" \
    < "$SCRIPT_DIR/release/diagnostics/record-deploy-attempt.py"; then
    [ "$status" = running ] || RELEASE_TERMINAL_EVENT_RECORDED=1
  else
    echo "[警告] $RELEASE_ACTION/$status 事件未能写入 Neko 队列；阶段结果不受影响" >&2
  fi
}

start_deploy_slow_notification() {
  local remaining="$((DEPLOY_SLOW_NOTICE_SECONDS - ($(date +%s) - DEPLOY_REQUESTED_EPOCH_SECONDS)))"
  [ "$remaining" -ge 0 ] || remaining=0
  (trap - EXIT; [ "$remaining" -eq 0 ] || sleep "$remaining"; record_release_event running 0) &
  DEPLOY_SLOW_NOTICE_PID=$!
}
