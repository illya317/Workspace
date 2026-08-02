#!/usr/bin/env bash
set -uo pipefail

diagnostic_failures=()
diagnostic_exit_status=0
record_failure() {
  diagnostic_failures+=("$2")
  (( diagnostic_exit_status != 0 )) || diagnostic_exit_status="$1"
}
finish_diagnostics() {
  (( ${#diagnostic_failures[@]} == 0 )) && return 0
  printf '[postgres-pitr] diagnostic failures (%d):\n' "${#diagnostic_failures[@]}" >&2
  for failure in "${diagnostic_failures[@]}"; do
    printf ' - %s\n' "$failure" >&2
  done
  return "$diagnostic_exit_status"
}

repository_check="${WORKSPACE_POSTGRESQL_PITR_REPOSITORY_CHECK_COMMAND:-}"
archive_mode=""
archive_command=""
archive_mode_read=0
archive_command_read=0
if archive_mode="$(psql -X -Atqc 'show archive_mode')"; then
  archive_mode_read=1
else
  record_failure 1 "unable to read archive_mode"
fi
if archive_command="$(psql -X -Atqc 'show archive_command')"; then
  archive_command_read=1
else
  record_failure 1 "unable to read archive_command"
fi

repository_ready=1
if [ -z "$repository_check" ]; then
  record_failure 2 "blocked: no approved off-host repository check is configured"
  repository_ready=0
elif [[ "$repository_check" != /* ]]; then
  record_failure 1 "repository check must be absolute"
  repository_ready=0
fi
if (( repository_ready == 1 )); then
  if [ ! -x "$repository_check" ]; then
    record_failure 1 "repository check is not executable"
    repository_ready=0
  fi
  owner=""
  mode=""
  if ! owner="$(stat -c '%U' "$repository_check")"; then
    record_failure 1 "unable to read repository check owner"
    repository_ready=0
  elif [ "$owner" != root ]; then
    record_failure 1 "repository check must be root-owned"
    repository_ready=0
  fi
  if ! mode="$(stat -c '%a' "$repository_check")"; then
    record_failure 1 "unable to read repository check mode"
    repository_ready=0
  elif [[ "$mode" =~ ^[0-7]+$ ]]; then
    mode_value=$((8#$mode))
    if (( (mode_value & 0022) != 0 )); then
      record_failure 1 "repository check must not be group/world writable"
      repository_ready=0
    fi
  else
    record_failure 1 "repository check mode is invalid"
    repository_ready=0
  fi
fi
if (( repository_ready == 1 )) && ! "$repository_check"; then
  record_failure 1 "off-host repository check failed"
fi

if (( archive_mode_read == 1 )) && [ "$archive_mode" != on ] && [ "$archive_mode" != always ]; then
  record_failure 3 "archive_mode is $archive_mode; enabling it requires a separately approved restart change"
fi
if (( archive_command_read == 1 )); then
  case "$archive_command" in ''|'(disabled)')
    record_failure 1 "archive_command is empty or disabled"
    ;;
  esac
fi

failed_count=""
last_failed_time=""
failed_count_read=0
last_failed_time_read=0
if failed_count="$(psql -X -Atqc 'select failed_count from pg_stat_archiver')"; then
  failed_count_read=1
else
  record_failure 1 "unable to read pg_stat_archiver.failed_count"
fi
if last_failed_time="$(psql -X -Atqc "select coalesce(last_failed_time::text,'') from pg_stat_archiver")"; then
  last_failed_time_read=1
else
  record_failure 1 "unable to read pg_stat_archiver.last_failed_time"
fi
if (( failed_count_read == 1 && last_failed_time_read == 1 )); then
  printf '[postgres-pitr] archiver status: failed_count=%s last_failed_time=%s\n' "$failed_count" "$last_failed_time"
fi

finish_diagnostics || exit "$?"
printf '[postgres-pitr] repository and archive configuration present\n'
