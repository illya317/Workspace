#!/usr/bin/env bash
set -euo pipefail

target_dir="${1:-./secrets}"
umask 077
mkdir -p "${target_dir}"

secret_names=(
  postgres_admin_password
  workspace_dev_runtime_password
  workspace_dev_migrator_password
  workspace_dev_backup_password
  workspace_dev_monitor_password
  workspace_dev_sql_settings_request_hmac
)

for secret_name in "${secret_names[@]}"; do
  secret_path="${target_dir}/${secret_name}"
  if [[ -e "${secret_path}" ]]; then
    echo "Refusing to overwrite existing secret: ${secret_path}" >&2
    exit 1
  fi
done

for secret_name in "${secret_names[@]}"; do
  secret_path="${target_dir}/${secret_name}"
  temporary_path="${secret_path}.tmp.$$"
  openssl rand -hex 32 > "${temporary_path}"
  chmod 0600 "${temporary_path}"
  mv "${temporary_path}" "${secret_path}"
  echo "created ${secret_path}"
done
