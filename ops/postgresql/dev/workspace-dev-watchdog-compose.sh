#!/usr/bin/env bash
set -euo pipefail

readonly STACK_ROOT="/home/ubuntu/workspace-dev"
readonly SOURCE_ROOT="${STACK_ROOT}/source"
readonly SECURE_RUNTIME_ROOT="${STACK_ROOT}/postgresql-security"
readonly CONTAINER_NAME="workspace-dev"
readonly NEXT_CACHE="${SOURCE_ROOT}/.next"
readonly DEV_SERVER_LOCK="${SOURCE_ROOT}/.cache/runtime/local-dev-server.lock"
readonly STATE_DIR="${STACK_ROOT}/runtime/watchdog"
readonly HIGH_COUNT_FILE="${STATE_DIR}/next-rss-high-count"
readonly LAST_RESTART_FILE="${STATE_DIR}/last-restart-epoch"
readonly RESTART_HISTORY_FILE="${STATE_DIR}/restart-history"

readonly NEXT_RSS_LIMIT_MIB="${WORKSPACE_DEV_NEXT_RSS_LIMIT_MIB:-6144}"
readonly REQUIRED_HIGH_SAMPLES="${WORKSPACE_DEV_REQUIRED_HIGH_SAMPLES:-2}"
readonly STARTUP_GRACE_SECONDS="${WORKSPACE_DEV_STARTUP_GRACE_SECONDS:-180}"
readonly RESTART_COOLDOWN_SECONDS="${WORKSPACE_DEV_RESTART_COOLDOWN_SECONDS:-900}"
readonly MAX_RESTARTS_PER_HOUR="${WORKSPACE_DEV_MAX_RESTARTS_PER_HOUR:-2}"

mkdir -p "${STATE_DIR}"

log() {
  logger -t workspace-dev-watchdog -- "$*"
  printf '%s\n' "$*"
}

compose_app() {
  docker compose \
    --project-name workspace-dev-secure \
    --env-file "${SECURE_RUNTIME_ROOT}/.env" \
    --file "${SECURE_RUNTIME_ROOT}/compose.yaml" \
    "$@"
}

validate_runtime_environment() {
  local env_file="${SECURE_RUNTIME_ROOT}/app.env"
  if [[ ! -r "${env_file}" ]]; then
    log "secure app.env is missing or unreadable"
    return 1
  fi
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|PGPASSWORD|PGOPTIONS)[[:space:]]*=' "${env_file}"; then
    log "secure app.env contains forbidden database or migration variables"
    return 1
  fi
}

read_nonnegative_integer() {
  local file_path="$1"
  local fallback="$2"
  local value
  value="$(sed -n '1p' "${file_path}" 2>/dev/null || true)"
  if [[ "${value}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${value}"
  else
    printf '%s\n' "${fallback}"
  fi
}

write_state_value() {
  local file_path="$1"
  local value="$2"
  local temporary_path="${file_path}.$$"
  printf '%s\n' "${value}" > "${temporary_path}"
  mv -f "${temporary_path}" "${file_path}"
}

reset_high_count() {
  write_state_value "${HIGH_COUNT_FILE}" 0
}

clean_generated_runtime() {
  rm -f "${DEV_SERVER_LOCK}"
  if [[ -d "${NEXT_CACHE}" ]]; then
    find "${NEXT_CACHE}" -xdev -mindepth 1 -delete
    rmdir "${NEXT_CACHE}" 2>/dev/null || true
  fi
}

has_active_restart_lease() {
  docker exec "${CONTAINER_NAME}" node -e '
    const fs = require("node:fs");
    try {
      const value = JSON.parse(fs.readFileSync("/workspace/.cache/runtime/local-dev-restart-leases.json", "utf8"));
      process.exit((value.leases || []).some((lease) => Date.parse(lease.expiresAt) > Date.now()) ? 0 : 1);
    } catch {
      process.exit(1);
    }
  ' >/dev/null 2>&1
}

prune_restart_history() {
  local now="$1"
  local cutoff=$((now - 3600))
  local temporary_path="${RESTART_HISTORY_FILE}.$$"
  if [[ -f "${RESTART_HISTORY_FILE}" ]]; then
    awk -v cutoff="${cutoff}" '$1 ~ /^[0-9]+$/ && $1 >= cutoff' "${RESTART_HISTORY_FILE}" > "${temporary_path}"
  else
    : > "${temporary_path}"
  fi
  mv -f "${temporary_path}" "${RESTART_HISTORY_FILE}"
}

automatic_restart() {
  local reason="$1"
  local now
  local last_restart
  local restart_count
  now="$(date +%s)"

  if has_active_restart_lease; then
    reset_high_count
    log "restart suppressed by an active dev:guard lease; reason=${reason}"
    return 0
  fi

  last_restart="$(read_nonnegative_integer "${LAST_RESTART_FILE}" 0)"
  if (( now - last_restart < RESTART_COOLDOWN_SECONDS )); then
    reset_high_count
    log "restart suppressed by cooldown; reason=${reason} remaining_seconds=$((RESTART_COOLDOWN_SECONDS - now + last_restart))"
    return 0
  fi

  prune_restart_history "${now}"
  restart_count="$(wc -l < "${RESTART_HISTORY_FILE}")"
  if (( restart_count >= MAX_RESTARTS_PER_HOUR )); then
    reset_high_count
    log "restart fuse open after ${restart_count} automatic restarts in one hour; reason=${reason}"
    return 0
  fi

  log "clean restart starting; reason=${reason}"
  validate_runtime_environment
  compose_app stop app
  clean_generated_runtime
  compose_app up -d --no-deps app
  printf '%s\n' "${now}" >> "${RESTART_HISTORY_FILE}"
  write_state_value "${LAST_RESTART_FILE}" "${now}"
  reset_high_count
  log "clean restart requested; stale dev lock and generated Next cache removed"
}

container_state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.StartedAt}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
if [[ -z "${container_state}" ]]; then
  reset_high_count
  log "app container missing; recreating dev stack"
  validate_runtime_environment
  clean_generated_runtime
  compose_app up -d --no-deps app
  exit 0
fi

read -r runtime_status health_status started_at <<< "${container_state}"
if [[ "${runtime_status}" != "running" ]]; then
  automatic_restart "container-state-${runtime_status}"
  exit 0
fi

if [[ "${health_status}" == "starting" ]]; then
  reset_high_count
  exit 0
fi

started_epoch="$(date -d "${started_at}" +%s 2>/dev/null || printf '0')"
now="$(date +%s)"
if (( now - started_epoch < STARTUP_GRACE_SECONDS )); then
  reset_high_count
  exit 0
fi

if [[ "${health_status}" == "unhealthy" ]]; then
  automatic_restart "container-health-unhealthy"
  exit 0
fi

next_rss_kib="$(docker exec "${CONTAINER_NAME}" ps -eo rss=,args= 2>/dev/null \
  | awk '/next-server/ { total += $1 } END { print total + 0 }' \
  || printf '0')"
if ! [[ "${next_rss_kib}" =~ ^[0-9]+$ ]] || (( next_rss_kib == 0 )); then
  reset_high_count
  log "Next server RSS sample unavailable; health=${health_status}"
  exit 0
fi

next_rss_mib=$((next_rss_kib / 1024))
if (( next_rss_mib < NEXT_RSS_LIMIT_MIB )); then
  reset_high_count
  exit 0
fi

high_count="$(read_nonnegative_integer "${HIGH_COUNT_FILE}" 0)"
high_count=$((high_count + 1))
write_state_value "${HIGH_COUNT_FILE}" "${high_count}"
log "Next RSS high sample ${high_count}/${REQUIRED_HIGH_SAMPLES}: ${next_rss_mib} MiB >= ${NEXT_RSS_LIMIT_MIB} MiB"

if (( high_count >= REQUIRED_HIGH_SAMPLES )); then
  automatic_restart "next-rss-${next_rss_mib}MiB"
fi
