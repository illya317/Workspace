#!/bin/bash

_RELEASE_TIMING_MODULE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/release-timing.mjs"
_RELEASE_TIMING_OUTPUT=""
_RELEASE_TIMING_RELEASE_ID=""
_RELEASE_TIMING_SCOPE=""
_RELEASE_TIMING_ACTIVE_STATE_FILE=""
_RELEASE_TIMING_ACTIVE_STAGE=""
_RELEASE_TIMING_ACTIVE_HAD_ERRTRACE=0

release_timing_configure() {
  if [ "$#" -ne 3 ]; then
    echo "usage: release_timing_configure OUTPUT RELEASE_ID SCOPE" >&2
    return 2
  fi
  _RELEASE_TIMING_OUTPUT="$1"
  _RELEASE_TIMING_RELEASE_ID="$2"
  _RELEASE_TIMING_SCOPE="$3"
}

release_timing_begin() {
  if [ "$#" -ne 1 ]; then
    echo "usage: release_timing_begin STAGE" >&2
    return 2
  fi
  if [ -z "$_RELEASE_TIMING_OUTPUT" ] || [ -z "$_RELEASE_TIMING_RELEASE_ID" ] || [ -z "$_RELEASE_TIMING_SCOPE" ]; then
    echo "release_timing_configure must be called before release_timing_begin" >&2
    return 2
  fi
  local timing_stage="$1"
  local timing_state_file
  timing_state_file="$(mktemp "${TMPDIR:-/tmp}/workspace-release-timing.XXXXXX")"
  if ! node "$_RELEASE_TIMING_MODULE" begin \
    --state "$timing_state_file" \
    --release-id "$_RELEASE_TIMING_RELEASE_ID" \
    --scope "$_RELEASE_TIMING_SCOPE" \
    --stage "$timing_stage"; then
    rm -f "$timing_state_file"
    return 1
  fi
  printf '%s\n' "$timing_state_file"
}

release_timing_finish() {
  if [ "$#" -ne 3 ]; then
    echo "usage: release_timing_finish STATE_FILE STATUS EXIT_CODE" >&2
    return 2
  fi
  local timing_state_file="$1"
  local timing_status="$2"
  local timing_exit_code="$3"
  local timing_event
  if ! timing_event="$(node "$_RELEASE_TIMING_MODULE" finish \
    --state "$timing_state_file" \
    --output "$_RELEASE_TIMING_OUTPUT" \
    --status "$timing_status" \
    --exit-code "$timing_exit_code")"; then
    rm -f "$timing_state_file"
    return 1
  fi
  rm -f "$timing_state_file"
  printf 'WORKSPACE_RELEASE_TIMING %s\n' "$timing_event"
}

_release_timing_active_restore_shell() {
  trap - ERR
  if [ "$_RELEASE_TIMING_ACTIVE_HAD_ERRTRACE" -eq 0 ]; then set +E; fi
  _RELEASE_TIMING_ACTIVE_HAD_ERRTRACE=0
}

_release_timing_active_error() {
  local timing_exit_code="$1"
  local timing_state_file="$_RELEASE_TIMING_ACTIVE_STATE_FILE"
  local timing_stage="$_RELEASE_TIMING_ACTIVE_STAGE"
  local timing_status="failed"
  _RELEASE_TIMING_ACTIVE_STATE_FILE=""
  _RELEASE_TIMING_ACTIVE_STAGE=""
  _release_timing_active_restore_shell

  if [ "$timing_exit_code" -eq 0 ]; then
    timing_status="passed"
  elif [ "$timing_exit_code" -gt 128 ] && [ "$timing_exit_code" -le 192 ] \
    && kill -l "$((timing_exit_code - 128))" >/dev/null 2>&1; then
    timing_status="cancelled"
  fi
  if [ -n "$timing_state_file" ] && [ -f "$timing_state_file" ] \
    && ! release_timing_finish "$timing_state_file" "$timing_status" "$timing_exit_code"; then
    echo "release timing record failed for ${_RELEASE_TIMING_SCOPE}/${timing_stage}" >&2
  fi
  return 0
}

release_timing_active_finalize_on_exit() {
  if [ "$#" -ne 1 ]; then
    echo "usage: release_timing_active_finalize_on_exit EXIT_CODE" >&2
    return 2
  fi
  if [ -z "$_RELEASE_TIMING_ACTIVE_STATE_FILE" ]; then
    return 0
  fi
  _release_timing_active_error "$1"
}

release_timing_active_begin() {
  if [ "$#" -ne 1 ]; then
    echo "usage: release_timing_active_begin STAGE" >&2
    return 2
  fi
  if [ -n "$(trap -p ERR)" ]; then
    echo "release_timing_active_begin cannot replace an existing ERR trap" >&2
    return 1
  fi

  local timing_state_file
  timing_state_file="$(release_timing_begin "$1")" || return $?
  _RELEASE_TIMING_ACTIVE_STATE_FILE="$timing_state_file"
  _RELEASE_TIMING_ACTIVE_STAGE="$1"
  case "$-" in
    *E*) _RELEASE_TIMING_ACTIVE_HAD_ERRTRACE=1 ;;
    *) _RELEASE_TIMING_ACTIVE_HAD_ERRTRACE=0 ;;
  esac
  set -E
  trap '_release_timing_active_error "$?"' ERR
}

release_timing_active_passed() {
  if [ "$#" -ne 0 ]; then
    echo "usage: release_timing_active_passed" >&2
    return 2
  fi
  local timing_state_file="$_RELEASE_TIMING_ACTIVE_STATE_FILE"
  local timing_stage="$_RELEASE_TIMING_ACTIVE_STAGE"
  _RELEASE_TIMING_ACTIVE_STATE_FILE=""
  _RELEASE_TIMING_ACTIVE_STAGE=""
  _release_timing_active_restore_shell
  if [ -z "$timing_state_file" ] || [ ! -f "$timing_state_file" ]; then
    echo "release_timing_active_begin must succeed before release_timing_active_passed" >&2
    return 1
  fi
  if ! release_timing_finish "$timing_state_file" passed 0; then
    echo "release timing record failed for ${_RELEASE_TIMING_SCOPE}/${timing_stage}" >&2
  fi
  return 0
}

release_timing_run() {
  if [ "$#" -lt 2 ]; then
    echo "usage: release_timing_run STAGE COMMAND [ARG...]" >&2
    return 2
  fi

  local timing_stage="$1"
  shift
  if declare -F "$1" >/dev/null 2>&1; then
    echo "release_timing_run only accepts external commands; use begin/finish around stateful shell functions" >&2
    return 2
  fi

  local timing_state_file
  timing_state_file="$(release_timing_begin "$timing_stage")" || return $?

  local timing_had_errexit=0
  case "$-" in
    *e*) timing_had_errexit=1 ;;
  esac
  set +e

  "$@"
  local timing_command_status=$?
  local timing_status="failed"
  if [ "$timing_command_status" -eq 0 ]; then
    timing_status="passed"
  elif [ "$timing_command_status" -gt 128 ] && [ "$timing_command_status" -le 192 ] \
    && kill -l "$((timing_command_status - 128))" >/dev/null 2>&1; then
    timing_status="cancelled"
  fi

  if ! release_timing_finish "$timing_state_file" "$timing_status" "$timing_command_status"; then
    echo "release timing record failed for ${_RELEASE_TIMING_SCOPE}/${timing_stage}" >&2
  fi

  if [ "$timing_had_errexit" -eq 1 ]; then set -e; fi
  return "$timing_command_status"
}
