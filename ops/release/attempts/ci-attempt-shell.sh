#!/usr/bin/env bash

# Source this file from the release CI entrypoint. It installs an EXIT trap only
# after the draft exists, so every later success/failure path produces one final
# immutable attempt receipt without capturing command output or environment data.

release_ci_attempt_tool() {
  local library_dir
  library_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  printf '%s/ci-attempt.mjs\n' "${library_dir}"
}

release_ci_attempt_begin() {
  if (( $# < 4 || $# > 5 )); then
    echo "usage: release_ci_attempt_begin <repository-root> <run-id> <target> <target-mode> [required-lanes]" >&2
    return 2
  fi
  local repository_root="$1"
  local run_id="$2"
  local target="$3"
  local target_mode="$4"
  local required_lanes="${5:-candidate-freeze,artifact-preflight,database,source,artifact-build,static-acceptance,rehearsal,application-ready}"

  if [[ ! "${run_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]] ||
    [[ ! "${target}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]] ||
    [[ ! "${target_mode}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]]; then
    echo "release CI attempt run, target, and mode must be safe path identifiers" >&2
    return 2
  fi

  RELEASE_CI_ATTEMPT_HISTORY_ROOT="${repository_root}/.cache/release-attempts"
  RELEASE_CI_ATTEMPT_DIRECTORY="${RELEASE_CI_ATTEMPT_HISTORY_ROOT}/${target}/${target_mode}"
  RELEASE_CI_ATTEMPT_DRAFT="${RELEASE_CI_ATTEMPT_DIRECTORY}/${run_id}.draft.json"
  RELEASE_CI_ATTEMPT_RECEIPT="${RELEASE_CI_ATTEMPT_DIRECTORY}/${run_id}.json"
  RELEASE_CI_ATTEMPT_REPOSITORY_ROOT="${repository_root}"
  RELEASE_CI_RUN_ID="${run_id}"
  export RELEASE_CI_ATTEMPT_HISTORY_ROOT RELEASE_CI_ATTEMPT_DIRECTORY
  export RELEASE_CI_ATTEMPT_DRAFT RELEASE_CI_ATTEMPT_RECEIPT RELEASE_CI_ATTEMPT_REPOSITORY_ROOT
  export RELEASE_CI_RUN_ID

  node "$(release_ci_attempt_tool)" begin \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT}" \
    --run-id "${run_id}" \
    --target "${target}" \
    --target-mode "${target_mode}" \
    --required-lanes "${required_lanes}"
  RELEASE_CI_ATTEMPT_ACTIVE=1
  trap 'release_ci_attempt_finalize "$?"' EXIT
}

release_ci_attempt_bind() {
  node "$(release_ci_attempt_tool)" bind \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT:?attempt not started}" \
    --source-commit "$1" \
    --source-tree "$2" \
    --content-digest "$3" \
    --configuration-digest "$4"
}

release_ci_attempt_lane_start() {
  node "$(release_ci_attempt_tool)" lane-start \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT:?attempt not started}" \
    --lane "$1" \
    --command-id "$2"
}

release_ci_attempt_lane_log_file() {
  local lane="$1"
  if [[ ! "${lane}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$ ]]; then
    echo "release CI lane must be a safe path identifier" >&2
    return 2
  fi
  printf '%s/%s.%s.log\n' "${RELEASE_CI_ATTEMPT_DIRECTORY:?attempt not started}" "${RELEASE_CI_RUN_ID:?attempt not started}" "${lane}"
}

release_ci_attempt_log_message() {
  local lane="$1"
  shift
  local log_file
  log_file="$(release_ci_attempt_lane_log_file "$lane")"
  umask 077
  printf '%s\n' "$*" | tee -a "$log_file"
  chmod 0600 "$log_file"
}

release_ci_attempt_capture() {
  if (( $# < 3 )) || [[ "$2" != "--" ]]; then
    echo "usage: release_ci_attempt_capture <lane> -- <command> [args ...]" >&2
    return 2
  fi
  local lane="$1"
  shift 2
  local log_file pipe_file tee_pid command_status tee_status restore_errexit=0
  log_file="$(release_ci_attempt_lane_log_file "$lane")"
  pipe_file="${log_file}.${BASHPID}.pipe"
  umask 077
  mkfifo -m 600 "$pipe_file"
  tee -a "$log_file" < "$pipe_file" &
  tee_pid=$!
  [[ $- != *e* ]] || restore_errexit=1
  set +e
  "$@" > "$pipe_file" 2>&1
  command_status=$?
  set -e
  wait "$tee_pid"
  tee_status=$?
  rm -f -- "$pipe_file"
  chmod 0600 "$log_file"
  if (( restore_errexit == 1 )); then set -e; else set +e; fi
  if (( tee_status != 0 )); then return "$tee_status"; fi
  return "$command_status"
}

release_ci_attempt_log_evidence() {
  local lane="$1" log_file
  log_file="$(release_ci_attempt_lane_log_file "$lane")"
  [ ! -f "$log_file" ] || printf 'lane-log:%s\n' "$log_file"
}

release_ci_attempt_lane_pass() {
  if (( $# < 1 )); then
    echo "usage: release_ci_attempt_lane_pass <lane> [kind:path ...]" >&2
    return 2
  fi
  local lane="$1"
  shift
  local arguments=()
  local item
  item="$(release_ci_attempt_log_evidence "$lane")"
  [ -z "$item" ] || arguments+=(--evidence "$item")
  for item in "$@"; do
    arguments+=(--evidence "${item}")
  done
  node "$(release_ci_attempt_tool)" lane-finish \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT:?attempt not started}" \
    --lane "${lane}" \
    --status passed \
    --repository "${RELEASE_CI_ATTEMPT_REPOSITORY_ROOT:?attempt not started}" \
    "${arguments[@]}"
}

release_ci_attempt_lane_fail() {
  if (( $# < 3 )); then
    echo "usage: release_ci_attempt_lane_fail <lane> <error-code> <exit-code> [kind:path ...]" >&2
    return 2
  fi
  local lane="$1"
  local error_code="$2"
  local exit_code="$3"
  shift 3
  local arguments=()
  local item
  item="$(release_ci_attempt_log_evidence "$lane")"
  [ -z "$item" ] || arguments+=(--evidence "$item")
  for item in "$@"; do
    arguments+=(--evidence "${item}")
  done
  node "$(release_ci_attempt_tool)" lane-finish \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT:?attempt not started}" \
    --lane "${lane}" \
    --status failed \
    --repository "${RELEASE_CI_ATTEMPT_REPOSITORY_ROOT:?attempt not started}" \
    --error-code "${error_code}" \
    --exit-code "${exit_code}" \
    "${arguments[@]}"
}

release_ci_attempt_lane_block() {
  node "$(release_ci_attempt_tool)" lane-finish \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT:?attempt not started}" \
    --lane "$1" \
    --status blocked \
    --command-id "$2" \
    --repository "${RELEASE_CI_ATTEMPT_REPOSITORY_ROOT:?attempt not started}"
}

release_ci_attempt_finalize() {
  local original_status="${1:-0}"
  trap - EXIT
  if [[ "${RELEASE_CI_ATTEMPT_ACTIVE:-0}" != "1" ]]; then
    exit "${original_status}"
  fi
  RELEASE_CI_ATTEMPT_ACTIVE=0

  local finalize_status=0
  node "$(release_ci_attempt_tool)" finalize \
    --draft "${RELEASE_CI_ATTEMPT_DRAFT}" \
    --output "${RELEASE_CI_ATTEMPT_RECEIPT}" \
    --history-root "${RELEASE_CI_ATTEMPT_HISTORY_ROOT}" \
    --repository "${RELEASE_CI_ATTEMPT_REPOSITORY_ROOT}" \
    --exit-code "${original_status}" || finalize_status=$?

  if (( finalize_status == 42 )); then
    original_status=42
  elif (( original_status == 0 && finalize_status != 0 )); then
    original_status="${finalize_status}"
  fi
  if [[ -f "${RELEASE_CI_ATTEMPT_RECEIPT}" ]]; then
    echo "release CI attempt receipt: ${RELEASE_CI_ATTEMPT_RECEIPT}"
  fi
  exit "${original_status}"
}
