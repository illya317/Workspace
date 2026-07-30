#!/usr/bin/env bash
set -euo pipefail

umask 077
install -d -m 0700 /backups

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_dump="/backups/workspace-dev-${timestamp}.dump"
final_manifest="${final_dump}.sha256"
temporary_dump="$(mktemp -p /backups .workspace-dev-backup.XXXXXX)"
temporary_manifest="${temporary_dump}.sha256"
published=0

cleanup() {
  unset PGPASSWORD
  rm -f -- "${temporary_dump}" "${temporary_manifest}"
  if (( published == 0 )); then
    rm -f -- "${final_dump}" "${final_manifest}"
  fi
}
trap cleanup EXIT

export PGHOST=db
export PGPORT=5432
export PGDATABASE=workspace_dev
export PGUSER=workspace_dev_backup
export PGPASSWORD="$(</run/secrets/workspace_dev_backup_password)"
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/run/secrets/postgres_ca
export PGCONNECT_TIMEOUT=5

pg_dump --format=custom --no-owner --no-privileges --file="${temporary_dump}"
pg_restore --list "${temporary_dump}" >/dev/null
sha256sum "${temporary_dump}" | sed "s#${temporary_dump}#$(basename "${final_dump}")#" > "${temporary_manifest}"
chmod 0600 "${temporary_dump}" "${temporary_manifest}"
mv "${temporary_dump}" "${final_dump}"
mv "${temporary_manifest}" "${final_manifest}"
(cd /backups && sha256sum --check "$(basename "${final_manifest}")")
published=1
unset PGPASSWORD
/workspace-dev/rotate-backups.sh /backups 7
trap - EXIT

echo "created verified development backup ${final_dump}"
