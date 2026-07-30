#!/usr/bin/env bash
set -euo pipefail

readonly action="${1:-}"
readonly runtime_root=/home/ubuntu/workspace-dev/postgresql-security
readonly dropin_dir=/etc/systemd/system/workspace-dev-watchdog.service.d
readonly dropin_target="${dropin_dir}/postgresql-security.conf"
readonly dropin_source="${runtime_root}/systemd/workspace-dev-watchdog-secure.conf"

if [[ "$(id -u)" != "0" ]]; then
  echo "Usage: sudo $0 <apply|status>" >&2
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
    reload_timer
    ;;
  status)
    validate_secure
    if [[ ! -r "${dropin_target}" ]] || ! cmp -s "${dropin_source}" "${dropin_target}"; then
      echo "Secure watchdog drop-in is missing or differs from the installed template" >&2
      exit 1
    fi
    systemctl cat workspace-dev-watchdog.service
    echo "watchdog compose mode=secure-only"
    ;;
  *)
    echo "Usage: sudo $0 <apply|status>" >&2
    exit 2
    ;;
esac
