#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --target /absolute/private/runtime/path" >&2
}

if [[ "${1:-}" != "--target" || -z "${2:-}" || -n "${3:-}" ]]; then
  usage
  exit 2
fi

target_dir="$2"
case "${target_dir}" in
  /*) ;;
  *) echo "Target must be absolute" >&2; exit 2 ;;
esac
case "${target_dir}" in
  /|/home|/home/ubuntu|/home/ubuntu/workspace-dev/source|/home/ubuntu/workspace-dev/worktrees/*)
    echo "Refusing unsafe or source-controlled target: ${target_dir}" >&2
    exit 2
    ;;
esac

source_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ -e "${target_dir}" ]] && find "${target_dir}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "Refusing to overwrite non-empty target: ${target_dir}" >&2
  exit 1
fi

install -d -m 0700 "${target_dir}" "${target_dir}/secrets" "${target_dir}/tls"
for template_file in \
  compose.yaml \
  compose.market-data.override.yaml \
  .env.example \
  app.env.example \
  pg_hba.conf \
  pg_ident.conf \
  roles-and-grants.sql \
  post-migrate-grants.sql \
  verify.sql \
  verify-shadow.sql \
  README.md \
  systemd/workspace-dev-postgresql-backup.service \
  systemd/workspace-dev-postgresql-backup.timer \
  systemd/workspace-dev-watchdog-secure.conf; do
  install -d -m 0700 "${target_dir}/$(dirname "${template_file}")"
  install -m 0600 "${source_dir}/${template_file}" "${target_dir}/${template_file}"
done
for executable_file in \
  backup-hook.sh \
  generate-secrets.sh \
  generate-tls.sh \
  install-node-deps.sh \
  migrate-app.sh \
  render-database-url.mjs \
  rotate-backups.sh \
  start-app.sh \
  start-db.sh \
  switch-watchdog.sh \
  workspace-dev-watchdog-compose.sh \
  verify.sh; do
  install -m 0700 "${source_dir}/${executable_file}" "${target_dir}/${executable_file}"
done

echo "installed PostgreSQL development security templates at ${target_dir}"
echo "No live service, database, secret, or certificate was changed. Follow ${target_dir}/README.md."
