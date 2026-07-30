#!/usr/bin/env bash
set -euo pipefail

repository_check="${WORKSPACE_POSTGRESQL_PITR_REPOSITORY_CHECK_COMMAND:-}"
archive_mode="$(psql -X -Atqc 'show archive_mode')"
archive_command="$(psql -X -Atqc 'show archive_command')"

if [ -z "$repository_check" ]; then
  printf '[postgres-pitr] blocked: no approved off-host repository check is configured; archive_mode=%s\n' "$archive_mode" >&2
  exit 2
fi
case "$repository_check" in /*) ;; *) printf '[postgres-pitr] repository check must be absolute\n' >&2; exit 1 ;; esac
[ -x "$repository_check" ] || { printf '[postgres-pitr] repository check is not executable\n' >&2; exit 1; }
owner="$(stat -c '%U' "$repository_check")"
mode="$(stat -c '%a' "$repository_check")"
mode_value=$((8#$mode))
[ "$owner" = root ] || { printf '[postgres-pitr] repository check must be root-owned\n' >&2; exit 1; }
(( (mode_value & 0022) == 0 )) || { printf '[postgres-pitr] repository check must not be group/world writable\n' >&2; exit 1; }
"$repository_check"

if [ "$archive_mode" != on ] && [ "$archive_mode" != always ]; then
  printf '[postgres-pitr] repository check passed; archive_mode is still off and must only be enabled in a separately approved restart change\n'
  exit 3
fi
case "$archive_command" in ''|'(disabled)')
  printf '[postgres-pitr] archive_mode is enabled without a command; fail closed\n' >&2
  exit 1
  ;;
esac
failed_count="$(psql -X -Atqc 'select failed_count from pg_stat_archiver')"
last_failed_time="$(psql -X -Atqc "select coalesce(last_failed_time::text,'') from pg_stat_archiver")"
printf '[postgres-pitr] repository and archive configuration present; failed_count=%s last_failed_time=%s\n' "$failed_count" "$last_failed_time"
