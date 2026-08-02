#!/usr/bin/env bash

deploy_preflight_failures=()
deploy_preflight_failure_codes=()
deploy_preflight_blocked=()
deploy_preflight_blocked_codes=()

begin_deploy_entry_preflight() {
  deploy_entry_finalized=0
  deploy_entry_started_at="${DEPLOY_REQUESTED_AT:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}"
  deploy_entry_repository="${REPOSITORY_ROOT:?controller repository root missing}"
  deploy_entry_attempt_id="deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%04x%04x' "$RANDOM" "$RANDOM")"
  deploy_entry_root="$deploy_entry_repository/.cache/release-deploy-attempts"
  deploy_entry_log="$deploy_entry_root/${deploy_entry_attempt_id}.log"
  deploy_entry_ledger_target=all
  deploy_entry_ledger_mode=all
  SELECTED_READY_TARGET="${SELECTED_READY_TARGET:-monolith}"
  SELECTED_READY_MODE="${SELECTED_READY_MODE:-activate}"
  trap 'finalize_deploy_entry_on_exit "$?"' EXIT
}

bind_deploy_entry_selector() {
  deploy_entry_ledger_target="$SELECTED_READY_TARGET"
  deploy_entry_ledger_mode="$SELECTED_READY_MODE"
}

finalize_deploy_entry_on_exit() {
  local exit_code="$1"
  [ "${deploy_entry_finalized:-0}" = 0 ] || return "$exit_code"
  deploy_preflight_fail deploy-invocation "deploy invocation exited before admission completed (status=$exit_code)"
  finish_deploy_entry_preflight >/dev/null 2>&1 || true
  return "$exit_code"
}

deploy_preflight_fail() {
  deploy_preflight_failure_codes+=("$1")
  deploy_preflight_failures+=("$2")
}

deploy_preflight_block() {
  deploy_preflight_blocked_codes+=("$1")
  deploy_preflight_blocked+=("$2")
}

finish_deploy_entry_preflight() {
  if [ "${#deploy_preflight_failures[@]}" -eq 0 ] && [ "${#deploy_preflight_blocked[@]}" -eq 0 ]; then
    deploy_entry_finalized=1
    trap - EXIT
    return 0
  fi
  echo "[错误] deploy 入口预检发现 failed=${#deploy_preflight_failures[@]} blocked=${#deploy_preflight_blocked[@]}；production mutation=0" >&2
  [ "${#deploy_preflight_failures[@]}" -eq 0 ] || printf '  failed: %s\n' "${deploy_preflight_failures[@]}" >&2
  [ "${#deploy_preflight_blocked[@]}" -eq 0 ] || printf '  blocked: %s\n' "${deploy_preflight_blocked[@]}" >&2
  if [ -z "${deploy_entry_repository:-}" ] || [ ! -d "$deploy_entry_repository" ]; then
    echo "[错误] deploy admission 无法写回执：release repository 无效" >&2
    return 1
  fi
  mkdir -p "$deploy_entry_root" || return 1
  if ! (set -o noclobber; : > "$deploy_entry_log") 2>/dev/null; then
    echo "[错误] deploy admission log 已存在: $deploy_entry_log" >&2
    return 1
  fi
  chmod 600 "$deploy_entry_log" || return 1
  [ "${#deploy_preflight_failures[@]}" -eq 0 ] || printf 'failed:%s\n' "${deploy_preflight_failure_codes[@]}" >> "$deploy_entry_log"
  [ "${#deploy_preflight_blocked[@]}" -eq 0 ] || printf 'blocked:%s\n' "${deploy_preflight_blocked_codes[@]}" >> "$deploy_entry_log"
  local failure_csv blocked_csv status=blocked completed_at admission_lock_fd
  failure_csv="$(IFS=,; printf '%s' "${deploy_preflight_failure_codes[*]}")"
  blocked_csv="$(IFS=,; printf '%s' "${deploy_preflight_blocked_codes[*]}")"
  [ "${#deploy_preflight_failures[@]}" -eq 0 ] || status=failed
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  chmod 400 "$deploy_entry_log" || return 1
  exec {admission_lock_fd}>> "$deploy_entry_root/.deploy-singleflight.lock" || return 1
  if ! flock -x "$admission_lock_fd"; then
    exec {admission_lock_fd}>&-
    return 1
  fi
  if ! WORKSPACE_DEPLOY_LEDGER_LOCK_FD="$admission_lock_fd" node "$(release_deploy_attempt_tool)" record-admission \
    --root "$deploy_entry_root" --repository "$deploy_entry_repository" \
    --attempt-id "$deploy_entry_attempt_id" --target "$deploy_entry_ledger_target" --target-mode "$deploy_entry_ledger_mode" \
    --source-commit "${RELEASE_SOURCE_SHA:-}" --source-tree "${RELEASE_SOURCE_TREE:-}" \
    --source-content "${RELEASE_CONTENT_DIGEST:-}" --controller-commit "${DEPLOY_CONTROL_SOURCE_SHA:-}" \
    --started-at "$deploy_entry_started_at" --completed-at "$completed_at" --status "$status" \
    --failure-codes "$failure_csv" --blocked-codes "$blocked_csv" --log "$deploy_entry_log" >/dev/null; then
    exec {admission_lock_fd}>&-
    return 1
  fi
  exec {admission_lock_fd}>&-
  deploy_entry_finalized=1
  trap - EXIT
  echo "[Deploy Admission] immutable attempt: $deploy_entry_root/admissions/$deploy_entry_attempt_id.json" >&2
  return 1
}

load_selected_ready() {
  ready_json="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current \
    --root "$RELEASE_WORKTREE/.cache/release-ready" "${READY_SELECTOR_ARGS[@]}")" || return 1
  ready_file="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptFile)' "$ready_json")" || return 1
  ready_values="$(node -e '
    const r=JSON.parse(process.argv[1]).receipt;
    process.stdout.write(`${r.runId}\n${r.source.commitSha}\n${r.source.treeId}\n${r.source.contentDigest}\n${r.configurationDigest}\n${r.target.id}\n${r.target.mode}\n`);
  ' "$ready_json")" || return 1
  ready_run_id="$(printf '%s\n' "$ready_values" | sed -n '1p')"
  ready_source="$(printf '%s\n' "$ready_values" | sed -n '2p')"
  ready_tree="$(printf '%s\n' "$ready_values" | sed -n '3p')"
  ready_content="$(printf '%s\n' "$ready_values" | sed -n '4p')"
  ready_configuration="$(printf '%s\n' "$ready_values" | sed -n '5p')"
  target_id="$(printf '%s\n' "$ready_values" | sed -n '6p')"
  target_mode="$(printf '%s\n' "$ready_values" | sed -n '7p')"
  [ "$target_id" = "$SELECTED_READY_TARGET" ] && [ "$target_mode" = "$SELECTED_READY_MODE" ] || {
    echo "[错误] selected Ready target 与 receipt target 不一致；deploy 禁止重定向目标" >&2
    return 1
  }
  [ "$ready_source" = "$RELEASE_SOURCE_SHA" ] && [ "$ready_tree" = "$RELEASE_SOURCE_TREE" ] \
    && [ "$ready_content" = "$RELEASE_CONTENT_DIGEST" ] && [ "$ready_configuration" = "$RELEASE_CONFIGURATION_DIGEST" ] || {
      echo "[错误] 当前 release source/config 没有 Ready Artifact；先运行 ci" >&2
      return 1
    }
}

acquire_controller_ready_qualification_lock() {
  controller_ready_lock_file="$REPOSITORY_ROOT/.cache/release-control/controller-ready.lock"
  mkdir -p "$(dirname "$controller_ready_lock_file")"
  exec {controller_ready_lock_fd}>> "$controller_ready_lock_file"
  echo "==> 等待 Controller Ready/Deploy 单飞锁"
  flock -x "$controller_ready_lock_fd"
}

load_controller_ready() {
  controller_ready_file="${DEPLOY_CONTROLLER_READY_RECEIPT_FILE:-$REPOSITORY_ROOT/.cache/release-control/controller-ready.json}"
  controller_ready_lock_file="$REPOSITORY_ROOT/.cache/release-control/controller-ready.lock"
  mkdir -p "$(dirname "$controller_ready_lock_file")" || return 1
  exec {controller_ready_lock_fd}>> "$controller_ready_lock_file" || return 1
  if ! flock -s -n "$controller_ready_lock_fd"; then
    exec {controller_ready_lock_fd}>&-
    echo "Controller Ready qualification is in progress" >&2
    return 2
  fi
  controller_ready_json="$(node "$SCRIPT_DIR/release/control/controller-ready.mjs" verify \
    --repository "$REPOSITORY_ROOT" --ready-source "$ready_source" --file "$controller_ready_file")" || {
      exec {controller_ready_lock_fd}>&-
      return 1
    }
  DEPLOY_CONTROL_SOURCE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.sourceSha)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_TREE_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.treeId)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.controlDigest)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_RECEIPT_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptDigest)' "$controller_ready_json")" || return 1
  export DEPLOY_CONTROL_SOURCE_SHA DEPLOY_CONTROL_TREE_ID DEPLOY_CONTROL_DIGEST DEPLOY_CONTROL_RECEIPT_DIGEST
}

load_controller_ready_for_preflight() {
  if load_controller_ready; then return 0; fi
  local controller_ready_status=$?
  if [ "$controller_ready_status" = 2 ]; then
    deploy_preflight_block controller-ready "Controller Ready 正在签发；本次 deploy 未进入 mutation"
  else
    deploy_preflight_fail controller-ready "Controller Ready receipt/identity 无效"
  fi
  return 1
}
