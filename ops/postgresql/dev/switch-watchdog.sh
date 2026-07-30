#!/usr/bin/env bash
set -euo pipefail

readonly action="${1:-}"
readonly runtime_root=/home/ubuntu/workspace-dev/postgresql-security
readonly legacy_env=/home/ubuntu/workspace-dev/runtime/.workspace/.env
readonly dropin_dir=/etc/systemd/system/workspace-dev-watchdog.service.d
readonly dropin_target="${dropin_dir}/postgresql-security.conf"
readonly dropin_source="${runtime_root}/systemd/workspace-dev-watchdog-secure.conf"
readonly mode_file=/etc/default/workspace-dev-watchdog-compose

if [[ "$(id -u)" != "0" ]]; then
  echo "Usage: sudo $0 <apply|rollback|status>" >&2
  exit 2
fi

forbidden_variables='DIRECT_URL|SHADOW_DATABASE_URL|PGPASSWORD|PGOPTIONS'

validate_secure() {
  local app_env="${runtime_root}/app.env"
  test -r "${runtime_root}/.env"
  test -r "${runtime_root}/compose.yaml"
  test -r "${runtime_root}/workspace-dev-watchdog-compose.sh"
  test -r "${dropin_source}"
  test -r "${app_env}"
  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?(DATABASE_URL|${forbidden_variables})[[:space:]]*=" "${app_env}"; then
    echo "Secure app.env contains a forbidden database or migration variable" >&2
    return 1
  fi
  /usr/bin/docker compose \
    --project-name workspace-dev-secure \
    --env-file "${runtime_root}/.env" \
    --file "${runtime_root}/compose.yaml" \
    config --no-env-resolution --quiet
}

validate_legacy_rollback() {
  test -r "${legacy_env}"
  if ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL[[:space:]]*=[[:space:]]*[^[:space:]]' "${legacy_env}"; then
    echo "Legacy rollback env must contain the rotated runtime DATABASE_URL" >&2
    return 1
  fi
  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?(${forbidden_variables})[[:space:]]*=" "${legacy_env}"; then
    echo "Legacy rollback env must remove DIRECT_URL, SHADOW_DATABASE_URL, PGPASSWORD, and PGOPTIONS" >&2
    return 1
  fi
  /usr/bin/docker compose \
    --project-name workspace-dev \
    --file /home/ubuntu/workspace-dev/compose.yaml \
    config --no-env-resolution --quiet
}

write_mode() {
  local mode="$1"
  local temporary_path
  temporary_path="$(mktemp /etc/default/.workspace-dev-watchdog-compose.XXXXXX)"
  printf 'WORKSPACE_DEV_WATCHDOG_STACK_MODE=%s\n' "${mode}" > "${temporary_path}"
  chmod 0644 "${temporary_path}"
  mv -f -- "${temporary_path}" "${mode_file}"
}

install_dropin() {
  install -d -m 0755 "${dropin_dir}"
  if [[ -e "${dropin_target}" ]] && ! cmp -s "${dropin_source}" "${dropin_target}"; then
    echo "Refusing to overwrite an unrelated watchdog drop-in: ${dropin_target}" >&2
    return 1
  fi
  install -m 0644 "${dropin_source}" "${dropin_target}"
}

reload_timer() {
  systemctl daemon-reload
  systemctl restart workspace-dev-watchdog.timer
  systemctl reset-failed workspace-dev-watchdog.service || true
}

case "${action}" in
  apply)
    validate_secure
    install_dropin
    write_mode secure
    reload_timer
    ;;
  rollback)
    validate_legacy_rollback
    install_dropin
    write_mode legacy
    reload_timer
    ;;
  status)
    systemctl cat workspace-dev-watchdog.service
    if [[ -r "${mode_file}" ]]; then
      sed -n '1p' "${mode_file}"
    else
      echo "watchdog compose mode is not configured" >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: sudo $0 <apply|rollback|status>" >&2
    exit 2
    ;;
esac
