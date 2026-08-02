#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly EXPECTED_RUNTIME_ROOT="/home/ubuntu/workspace-dev/postgresql-security"
readonly WORKER_INSTALL_ROOT="/usr/local/lib/workspace-postgresql-dev"
readonly WORKER_STATE_ROOT="/var/lib/workspace-postgresql-dev"

usage() {
  echo "Usage: sudo $0 --runtime-root ${EXPECTED_RUNTIME_ROOT}" >&2
}

if [ "$(id -u)" -ne 0 ] || [ "${1:-}" != "--runtime-root" ] || [ -z "${2:-}" ] || [ -n "${3:-}" ]; then
  usage
  exit 2
fi

source_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_root="$(realpath -e -- "$2")"
[ "$runtime_root" = "$EXPECTED_RUNTIME_ROOT" ] \
  || { echo "Refusing a runtime root outside ${EXPECTED_RUNTIME_ROOT}" >&2; exit 2; }

for required_file in compose.yaml .env app.env sql-settings-worker.sh sql-settings-worker.service sql-settings-worker.timer; do
  candidate="$runtime_root/$required_file"
  [ -f "$candidate" ] && [ ! -L "$candidate" ] \
    || { echo "Missing or unsafe runtime file: $candidate" >&2; exit 1; }
done
[ "$source_dir" = "$runtime_root" ] \
  || { echo "Run the installer copied into the governed runtime root" >&2; exit 2; }

secrets_directory="$runtime_root/secrets"
[ -d "$secrets_directory" ] && [ ! -L "$secrets_directory" ] \
  || { echo "The secrets directory must be a real directory" >&2; exit 1; }
secret_names=(
  postgres_admin_password
  workspace_dev_runtime_password
  workspace_dev_migrator_password
  workspace_dev_backup_password
  workspace_dev_monitor_password
  workspace_dev_sql_settings_request_hmac
)
for secret_name in "${secret_names[@]}"; do
  secret_path="$secrets_directory/$secret_name"
  [ -f "$secret_path" ] && [ ! -L "$secret_path" ] \
    && [ "$(stat -c %a "$secret_path")" = 600 ] \
    || { echo "Missing or unsafe mode-0600 secret: $secret_path" >&2; exit 1; }
done

chown root:root "$runtime_root" "$runtime_root/compose.yaml" "$runtime_root/.env" "$runtime_root/app.env"
chmod 0700 "$runtime_root"
chmod 0600 "$runtime_root/compose.yaml" "$runtime_root/.env"
chmod 0644 "$runtime_root/app.env"
chown root:root "$secrets_directory"
chmod 0700 "$secrets_directory"
for secret_name in "${secret_names[@]}"; do
  secret_path="$secrets_directory/$secret_name"
  chown 1000:1000 "$secret_path"
  chmod 0600 "$secret_path"
done

install -d -o root -g root -m 0700 "$WORKER_INSTALL_ROOT" "$WORKER_STATE_ROOT"
install -o root -g root -m 0700 \
  "$runtime_root/sql-settings-worker.sh" \
  "$WORKER_INSTALL_ROOT/sql-settings-worker.sh"
install -o root -g root -m 0644 \
  "$runtime_root/sql-settings-worker.service" \
  /etc/systemd/system/sql-settings-worker.service
install -o root -g root -m 0644 \
  "$runtime_root/sql-settings-worker.timer" \
  /etc/systemd/system/sql-settings-worker.timer

systemd-analyze verify \
  /etc/systemd/system/sql-settings-worker.service \
  /etc/systemd/system/sql-settings-worker.timer
systemctl daemon-reload

echo "Installed the governed SQL settings worker."
echo "Review the pending queue before enabling sql-settings-worker.timer."
