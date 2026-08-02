#!/usr/bin/env bash

release_deploy_attempt_tool() {
  printf '%s/release/attempts/deploy-blocker.mjs' "${RELEASE_SCRIPT_DIR:-${SCRIPT_DIR:?release script directory missing}}"
}

release_deploy_attempt_run() {
  if [ "$#" -lt 2 ] || [ "$1" != -- ]; then
    echo "usage: release_deploy_attempt_run -- command [args...]" >&2
    return 2
  fi
  shift
  local history_root="${RELEASE_WORKTREE:?release worktree missing}/.cache/release-deploy-attempts"
  local attempt_id="deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%04x%04x' "$RANDOM" "$RANDOM")"
  local log_file="$history_root/${attempt_id}.log"
  mkdir -p "$history_root"
  if ! (set -o noclobber; : > "$log_file") 2>/dev/null; then
    echo "deploy attempt log already exists: $log_file" >&2
    return 1
  fi
  chmod 600 "$log_file"
  local started_at completed_at status exit_code tee_status tee_pid tee_fd had_errexit=0
  started_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  [[ $- != *e* ]] || had_errexit=1
  exec {tee_fd}> >(tee -a "$log_file")
  tee_pid=$!
  set +e
  "$@" >&"$tee_fd" 2>&1
  exit_code=$?
  exec {tee_fd}>&-
  wait "$tee_pid"
  tee_status=$?
  if [ "$exit_code" -eq 0 ] && [ "$tee_status" -ne 0 ]; then exit_code="$tee_status"; fi
  if [ "$had_errexit" -eq 1 ]; then set -e; else set +e; fi
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  if [ "$exit_code" = 0 ]; then status=succeeded
  elif [ "$exit_code" = 130 ] || [ "$exit_code" = 143 ]; then status=cancelled
  else status=failed
  fi
  chmod 400 "$log_file"
  if ! node "$(release_deploy_attempt_tool)" record \
    --root "$history_root" \
    --repository "$RELEASE_WORKTREE" \
    --attempt-id "$attempt_id" \
    --target "$SELECTED_READY_TARGET" \
    --target-mode "$SELECTED_READY_MODE" \
    --source-commit "$RELEASE_SOURCE_SHA" \
    --source-tree "$RELEASE_SOURCE_TREE" \
    --source-content "$RELEASE_CONTENT_DIGEST" \
    --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" \
    --controller-tree "$DEPLOY_CONTROL_TREE_ID" \
    --controller-digest "$DEPLOY_CONTROL_DIGEST" \
    --command-id deploy-production-v1 \
    --started-at "$started_at" \
    --completed-at "$completed_at" \
    --status "$status" \
    --exit-code "$exit_code" \
    --log "$log_file"; then
    echo "failed to persist immutable deploy attempt: $attempt_id" >&2
    return 1
  fi
  return "$exit_code"
}
