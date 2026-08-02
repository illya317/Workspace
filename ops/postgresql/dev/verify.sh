#!/usr/bin/env bash
set -uo pipefail

diagnostic_failures=()
record_failure() { diagnostic_failures+=("$1"); }
finish_diagnostics() {
  (( ${#diagnostic_failures[@]} == 0 )) && return 0
  printf 'PostgreSQL development security verification failed (%d):\n' "${#diagnostic_failures[@]}" >&2
  for failure in "${diagnostic_failures[@]}"; do
    printf ' - %s\n' "$failure" >&2
  done
  return 1
}

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

probe workspace_dev_migrator workspace_dev /run/secrets/workspace_dev_migrator_password \
  || record_failure "workspace_dev_migrator cannot connect to workspace_dev"
probe workspace_dev_migrator workspace_dev_shadow /run/secrets/workspace_dev_migrator_password \
  || record_failure "workspace_dev_migrator cannot connect to workspace_dev_shadow"
probe workspace_dev_backup workspace_dev /run/secrets/workspace_dev_backup_password \
  || record_failure "workspace_dev_backup cannot connect to workspace_dev"
probe workspace_dev_monitor workspace_dev /run/secrets/workspace_dev_monitor_password \
  || record_failure "workspace_dev_monitor cannot connect to workspace_dev"

if PGPASSWORD="$(password_from /run/secrets/workspace_dev_runtime_password)" \
  PGUSER=workspace_dev_runtime \
  PGDATABASE=workspace_dev_shadow \
  psql -X -Atqc 'SELECT 1' >/dev/null 2>&1; then
  record_failure "workspace_dev_runtime unexpectedly connected to workspace_dev_shadow"
fi

verification_rows=""
if verification_rows="$(
  PGPASSWORD="$(password_from /run/secrets/workspace_dev_runtime_password)" \
    PGUSER=workspace_dev_runtime \
    PGDATABASE=workspace_dev \
    psql -X -v ON_ERROR_STOP=1 -AtF '|' -f /workspace-dev/verify.sql
)"; then
  printf '%s\n' "${verification_rows}"
  if grep -Eq '\|f$' <<<"${verification_rows}"; then
    record_failure "one or more PostgreSQL runtime security checks returned false"
  fi
else
  record_failure "PostgreSQL runtime security query failed"
fi

shadow_verification_rows=""
if shadow_verification_rows="$(
  PGPASSWORD="$(password_from /run/secrets/workspace_dev_migrator_password)" \
    PGUSER=workspace_dev_migrator \
    PGDATABASE=workspace_dev_shadow \
    PGOPTIONS='-c role=workspace_dev_owner' \
    psql -X -v ON_ERROR_STOP=1 -AtF '|' -f /workspace-dev/verify-shadow.sql
)"; then
  printf '%s\n' "${shadow_verification_rows}"
  if grep -Eq '\|f$' <<<"${shadow_verification_rows}"; then
    record_failure "one or more PostgreSQL shadow ownership checks returned false"
  fi
else
  record_failure "PostgreSQL shadow ownership query failed"
fi

finish_diagnostics || exit 1
echo "PostgreSQL development security verification passed"
