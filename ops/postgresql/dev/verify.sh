#!/usr/bin/env bash
set -euo pipefail

export PGHOST=db
export PGPORT=5432
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/run/secrets/postgres_ca
export PGCONNECT_TIMEOUT=5

password_from() {
  local secret_file="$1"
  local secret_value
  secret_value="$(<"${secret_file}")"
  if (( ${#secret_value} < 32 )); then
    echo "Database password secret is missing or too short" >&2
    return 1
  fi
  printf '%s' "${secret_value}"
}

probe() {
  local role="$1"
  local database="$2"
  local secret_file="$3"
  PGPASSWORD="$(password_from "${secret_file}")" \
    PGUSER="${role}" \
    PGDATABASE="${database}" \
    psql -X -v ON_ERROR_STOP=1 -Atqc 'SELECT 1' >/dev/null
}

probe workspace_dev_migrator workspace_dev /run/secrets/workspace_dev_migrator_password
probe workspace_dev_migrator workspace_dev_shadow /run/secrets/workspace_dev_migrator_password
probe workspace_dev_backup workspace_dev /run/secrets/workspace_dev_backup_password
probe workspace_dev_monitor workspace_dev /run/secrets/workspace_dev_monitor_password

if PGPASSWORD="$(password_from /run/secrets/workspace_dev_runtime_password)" \
  PGUSER=workspace_dev_runtime \
  PGDATABASE=workspace_dev_shadow \
  psql -X -Atqc 'SELECT 1' >/dev/null 2>&1; then
  echo "Runtime role unexpectedly connected to shadow database" >&2
  exit 1
fi

verification_rows="$(
  PGPASSWORD="$(password_from /run/secrets/workspace_dev_runtime_password)" \
    PGUSER=workspace_dev_runtime \
    PGDATABASE=workspace_dev \
    psql -X -v ON_ERROR_STOP=1 -AtF '|' -f /workspace-dev/verify.sql
)"
printf '%s\n' "${verification_rows}"
if grep -Eq '\|f$' <<<"${verification_rows}"; then
  echo "One or more PostgreSQL security checks failed" >&2
  exit 1
fi

shadow_verification_rows="$(
  PGPASSWORD="$(password_from /run/secrets/workspace_dev_migrator_password)" \
    PGUSER=workspace_dev_migrator \
    PGDATABASE=workspace_dev_shadow \
    PGOPTIONS='-c role=workspace_dev_owner' \
    psql -X -v ON_ERROR_STOP=1 -AtF '|' -f /workspace-dev/verify-shadow.sql
)"
printf '%s\n' "${shadow_verification_rows}"
if grep -Eq '\|f$' <<<"${shadow_verification_rows}"; then
  echo "One or more PostgreSQL shadow ownership checks failed" >&2
  exit 1
fi

echo "PostgreSQL development security verification passed"
