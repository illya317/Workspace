#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != "0" ]]; then
  echo "PostgreSQL secret bootstrap must run as root" >&2
  exit 1
fi

tls_dir=/var/lib/postgresql/tls
private_dir="${tls_dir}/private"
bootstrap_dir=/workspace-dev/bootstrap
init_dir=/docker-entrypoint-initdb.d
password_secret_names=(
  postgres_admin_password
  workspace_dev_runtime_password
  workspace_dev_migrator_password
  workspace_dev_backup_password
  workspace_dev_monitor_password
)
configuration_names=(
  pg_hba.conf
  pg_ident.conf
  roles-and-grants.sql
)
temporary_path=""
cleanup() {
  if [[ -n "${temporary_path}" ]]; then
    rm -f -- "${temporary_path}"
  fi
}
trap cleanup EXIT

atomic_copy_for_postgres() {
  local source_path="$1"
  local destination_path="$2"
  local destination_dir
  local destination_name
  destination_dir="$(dirname "${destination_path}")"
  destination_name="$(basename "${destination_path}")"
  temporary_path="$(mktemp "${destination_dir}/.${destination_name}.XXXXXX")"
  install -o postgres -g postgres -m 0400 "${source_path}" "${temporary_path}"
  mv -f -- "${temporary_path}" "${destination_path}"
  temporary_path=""
}

install -d -o postgres -g postgres -m 0700 "${tls_dir}" "${private_dir}" "${init_dir}"
install -o postgres -g postgres -m 0644 /run/secrets/postgres_ca "${tls_dir}/ca.crt"
install -o postgres -g postgres -m 0644 /run/secrets/postgres_server_cert "${tls_dir}/server.crt"
install -o postgres -g postgres -m 0600 /run/secrets/postgres_server_key "${tls_dir}/server.key"

for secret_name in "${password_secret_names[@]}"; do
  atomic_copy_for_postgres \
    "/run/secrets/${secret_name}" \
    "${private_dir}/${secret_name}"
done
for configuration_name in "${configuration_names[@]}"; do
  atomic_copy_for_postgres \
    "${bootstrap_dir}/${configuration_name}" \
    "${private_dir}/${configuration_name}"
done
atomic_copy_for_postgres \
  "${private_dir}/roles-and-grants.sql" \
  "${init_dir}/20-workspace-security.sql"

export POSTGRES_PASSWORD_FILE="${private_dir}/postgres_admin_password"

openssl verify -CAfile "${tls_dir}/ca.crt" "${tls_dir}/server.crt"
openssl x509 -in "${tls_dir}/server.crt" -noout -checkhost db

trap - EXIT
exec /usr/local/bin/docker-entrypoint.sh "$@"
