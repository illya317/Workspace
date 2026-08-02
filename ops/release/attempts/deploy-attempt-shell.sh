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
  local history_root="${DEPLOY_ATTEMPT_ROOT:?deploy attempt root missing}"
  local attempt_repository="${DEPLOY_ATTEMPT_REPOSITORY:?deploy attempt repository missing}"
  local attempt_id="${RELEASE_DEPLOY_ATTEMPT_ID:-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%04x%04x' "$RANDOM" "$RANDOM")}"
  local log_file="$history_root/${attempt_id}.log"
  local lock_file="$history_root/.deploy-singleflight.lock"
  mkdir -p "$history_root"
  local lock_fd
  exec {lock_fd}>> "$lock_file"
  if ! (set -o noclobber; : > "$log_file") 2>/dev/null; then
    echo "deploy attempt log already exists: $log_file" >&2
    return 1
  fi
  chmod 600 "$log_file"
  local started_at completed_at status exit_code tee_status tee_pid tee_fd had_errexit=0
  local mutation_started=0 admission_status=failed admission_failure_codes="" admission_blocked_codes=""
  started_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  [[ $- != *e* ]] || had_errexit=1
  exec {tee_fd}> >(tee -a "$log_file")
  tee_pid=$!
  set +e
  RELEASE_DEPLOY_ATTEMPT_PARENT_PID="$BASHPID"
  export RELEASE_DEPLOY_ATTEMPT_PARENT_PID
  flock -x "$lock_fd" >&"$tee_fd" 2>&1
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    admission_failure_codes=deploy-singleflight-lock
  else
    WORKSPACE_DEPLOY_LEDGER_LOCK_FD="$lock_fd" node "$(release_deploy_attempt_tool)" consume-clear \
      --root "$history_root" --repository "$attempt_repository" \
      --target "$SELECTED_READY_TARGET" --target-mode "$SELECTED_READY_MODE" \
      --source-content "$RELEASE_CONTENT_DIGEST" --source-commit "$RELEASE_SOURCE_SHA" \
      --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" --attempt-id "$attempt_id" \
      --parent-pid "$RELEASE_DEPLOY_ATTEMPT_PARENT_PID" \
      --receipt "$RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE" >&"$tee_fd" 2>&1
    exit_code=$?
    if [ "$exit_code" -eq 42 ]; then
      admission_status=blocked
      admission_blocked_codes=deploy-retry-fence-recurrence
    elif [ "$exit_code" -eq 43 ]; then
      admission_status=blocked
      admission_blocked_codes=deploy-retry-fence-blocked
    elif [ "$exit_code" -ne 0 ]; then
      admission_failure_codes=deploy-retry-fence-contract
    fi
  fi
  if [ "$exit_code" -eq 0 ]; then
    mutation_started=1
    "$@" >&"$tee_fd" 2>&1
    exit_code=$?
  fi
  exec {tee_fd}>&-
  wait "$tee_pid"
  tee_status=$?
  if [ "$exit_code" -eq 0 ] && [ "$tee_status" -ne 0 ]; then exit_code="$tee_status"; fi
  if [ "$had_errexit" -eq 1 ]; then set -e; else set +e; fi
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  chmod 400 "$log_file"
  if [ "$mutation_started" -eq 0 ]; then
    if ! WORKSPACE_DEPLOY_LEDGER_LOCK_FD="$lock_fd" node "$(release_deploy_attempt_tool)" record-admission \
      --root "$history_root" \
      --repository "$attempt_repository" \
      --attempt-id "$attempt_id" \
      --target "$SELECTED_READY_TARGET" \
      --target-mode "$SELECTED_READY_MODE" \
      --source-commit "$RELEASE_SOURCE_SHA" \
      --source-tree "$RELEASE_SOURCE_TREE" \
      --source-content "$RELEASE_CONTENT_DIGEST" \
      --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" \
      --started-at "$started_at" \
      --completed-at "$completed_at" \
      --status "$admission_status" \
      --failure-codes "$admission_failure_codes" \
      --blocked-codes "$admission_blocked_codes" \
      --log "$log_file"; then
      echo "failed to persist immutable deploy admission: $attempt_id" >&2
      exec {lock_fd}>&-
      return 1
    fi
    exec {lock_fd}>&-
    return "$exit_code"
  fi
  if [ "$exit_code" = 0 ]; then status=succeeded
  elif [ "$exit_code" = 130 ] || [ "$exit_code" = 143 ]; then status=cancelled
  else status=failed
  fi
  if ! WORKSPACE_DEPLOY_LEDGER_LOCK_FD="$lock_fd" node "$(release_deploy_attempt_tool)" record \
    --root "$history_root" \
    --repository "$attempt_repository" \
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
    exec {lock_fd}>&-
    return 1
  fi
  exec {lock_fd}>&-
  return "$exit_code"
}
