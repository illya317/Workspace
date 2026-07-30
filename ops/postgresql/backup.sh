#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_root="${WORKSPACE_POSTGRESQL_BACKUP_ROOT:-/var/backups/workspace/postgresql}"
database_name="${WORKSPACE_POSTGRESQL_DATABASE:-workspace}"
backup_url="${WORKSPACE_POSTGRESQL_BACKUP_URL:-}"
offsite_command="${WORKSPACE_POSTGRESQL_OFFSITE_COMMAND:-}"
require_offsite="${WORKSPACE_POSTGRESQL_REQUIRE_OFFSITE:-0}"
daily_keep="${WORKSPACE_POSTGRESQL_DAILY_KEEP:-7}"
weekly_keep="${WORKSPACE_POSTGRESQL_WEEKLY_KEEP:-4}"
monthly_keep="${WORKSPACE_POSTGRESQL_MONTHLY_KEEP:-6}"

fail() {
  printf '[postgres-backup] %s\n' "$1" >&2
  exit 1
}

case "$backup_root" in
  /*) ;;
  *) fail "backup root must be absolute" ;;
esac
[ "$backup_root" != "/" ] || fail "backup root must not be /"
[ -n "$database_name" ] || fail "database name is required"
[[ "$database_name" =~ ^[A-Za-z0-9_]+$ ]] || fail "database name contains unsupported characters"
for value in "$daily_keep" "$weekly_keep" "$monthly_keep"; do
  [[ "$value" =~ ^[0-9]+$ ]] || fail "retention values must be integers"
done
case "$require_offsite" in 0|1) ;; *) fail "WORKSPACE_POSTGRESQL_REQUIRE_OFFSITE must be 0 or 1" ;; esac

install -d -m 0700 "$backup_root" "$backup_root/daily" "$backup_root/weekly" "$backup_root/monthly"
exec 9>"$backup_root/.backup.lock"
flock -n 9 || fail "another PostgreSQL backup is running"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stage_dir="$backup_root/daily/.incomplete-${timestamp}-$$"
final_dir="$backup_root/daily/$timestamp"
[ ! -e "$stage_dir" ] || fail "staging path already exists"
[ ! -e "$final_dir" ] || fail "backup path already exists"
install -d -m 0700 "$stage_dir"

cleanup_stage() {
  if [ -d "$stage_dir" ]; then
    case "$stage_dir" in
      "$backup_root"/daily/.incomplete-*) rm -rf -- "$stage_dir" ;;
      *) printf '[postgres-backup] refusing unsafe cleanup: %s\n' "$stage_dir" >&2 ;;
    esac
  fi
}
trap cleanup_stage EXIT

dump_file="$stage_dir/${database_name}.dump"
catalog_file="$stage_dir/${database_name}.dump.catalog"
globals_file="$stage_dir/globals.sql"
manifest_file="$stage_dir/manifest.json"

if [ -n "$backup_url" ]; then
  PGDATABASE="$backup_url" pg_isready >/dev/null
  PGDATABASE="$backup_url" pg_dump \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$dump_file"
else
  pg_isready --dbname="$database_name" >/dev/null
  pg_dump \
    --dbname="$database_name" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$dump_file"
fi

pg_restore --list "$dump_file" >"$catalog_file"
env -u PGDATABASE -u PGPASSWORD pg_dumpall --globals-only --no-role-passwords >"$globals_file"
chmod 0600 "$dump_file" "$catalog_file" "$globals_file"

if [ -n "$backup_url" ]; then
  server_version="$(PGDATABASE="$backup_url" psql -X -Atqc 'show server_version')"
  database_size="$(PGDATABASE="$backup_url" psql -X -Atqc 'select pg_database_size(current_database())')"
  end_lsn="$(PGDATABASE="$backup_url" psql -X -Atqc 'select pg_current_wal_lsn()')"
else
  server_version="$(psql -X --dbname="$database_name" -Atqc 'show server_version')"
  database_size="$(psql -X --dbname="$database_name" -Atqc 'select pg_database_size(current_database())')"
  end_lsn="$(psql -X --dbname="$database_name" -Atqc 'select pg_current_wal_lsn()')"
fi
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
dump_size="$(stat -c '%s' "$dump_file")"
dump_sha="$(sha256sum "$dump_file" | awk '{print $1}')"
catalog_sha="$(sha256sum "$catalog_file" | awk '{print $1}')"
globals_sha="$(sha256sum "$globals_file" | awk '{print $1}')"

python3 - "$manifest_file" "$database_name" "$started_at" "$finished_at" "$server_version" "$database_size" "$end_lsn" "$dump_size" "$dump_sha" "$catalog_sha" "$globals_sha" <<'PY'
import json
import os
import sys

(
    manifest_path,
    database,
    started_at,
    finished_at,
    server_version,
    database_size,
    end_lsn,
    dump_size,
    dump_sha,
    catalog_sha,
    globals_sha,
) = sys.argv[1:]
payload = {
    "schemaVersion": 1,
    "kind": "workspace-postgresql-logical-backup",
    "database": database,
    "startedAt": started_at,
    "finishedAt": finished_at,
    "serverVersion": server_version,
    "databaseSizeBytes": int(database_size),
    "endLsn": end_lsn,
    "dump": {
        "file": f"{database}.dump",
        "format": "custom",
        "ownerIncluded": False,
        "privilegesIncluded": False,
        "sizeBytes": int(dump_size),
        "sha256": dump_sha,
    },
    "catalog": {"file": f"{database}.dump.catalog", "sha256": catalog_sha},
    "globals": {"file": "globals.sql", "rolePasswordsIncluded": False, "sha256": globals_sha},
    "offsite": {"configured": False, "completed": False},
}
temporary = manifest_path + ".tmp"
with open(temporary, "x", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
os.chmod(temporary, 0o600)
os.replace(temporary, manifest_path)
PY

(
  cd "$stage_dir"
  sha256sum "${database_name}.dump" "${database_name}.dump.catalog" globals.sql manifest.json >SHA256SUMS
  chmod 0600 SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)

mv "$stage_dir" "$final_dir"
trap - EXIT
ln -sfn "daily/$timestamp" "$backup_root/.latest.tmp"
mv -Tf "$backup_root/.latest.tmp" "$backup_root/latest"

if [ -n "$offsite_command" ]; then
  case "$offsite_command" in /*) ;; *) fail "offsite command must be an absolute path" ;; esac
  [ -x "$offsite_command" ] || fail "offsite command is not executable"
  mode="$(stat -c '%a' "$offsite_command")"
  owner="$(stat -c '%U' "$offsite_command")"
  [ "$owner" = root ] || fail "offsite command must be root-owned"
  mode_value=$((8#$mode))
  (( (mode_value & 0022) == 0 )) || fail "offsite command must not be group/world writable"
  "$offsite_command" "$final_dir" "$final_dir/manifest.json"
  python3 - "$final_dir/manifest.json" <<'PY'
import json
import os
import sys
path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    payload = json.load(handle)
payload["offsite"] = {"configured": True, "completed": True}
temporary = path + ".tmp"
with open(temporary, "x", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY
  (
    cd "$final_dir"
    sha256sum "${database_name}.dump" "${database_name}.dump.catalog" globals.sql manifest.json >SHA256SUMS.tmp
    chmod 0600 SHA256SUMS.tmp
    mv SHA256SUMS.tmp SHA256SUMS
  )
elif [ "$require_offsite" = 1 ]; then
  fail "offsite backup is required but no approved command is configured"
fi

hardlink_snapshot() {
  local source_dir="$1"
  local target_dir="$2"
  if [ ! -e "$target_dir" ]; then
    cp -al -- "$source_dir" "$target_dir.tmp-$$"
    mv "$target_dir.tmp-$$" "$target_dir"
  fi
}

week_key="$(date -u +%G-W%V)"
month_key="$(date -u +%Y-%m)"
hardlink_snapshot "$final_dir" "$backup_root/weekly/$week_key"
hardlink_snapshot "$final_dir" "$backup_root/monthly/$month_key"

prune_series() {
  local series_root="$1"
  local keep="$2"
  local -a entries=()
  mapfile -t entries < <(find "$series_root" -mindepth 1 -maxdepth 1 -type d ! -name '.incomplete-*' -printf '%f\n' | LC_ALL=C sort)
  while [ "${#entries[@]}" -gt "$keep" ]; do
    local name="${entries[0]}"
    local candidate="$series_root/$name"
    case "$candidate" in "$series_root"/*) rm -rf -- "$candidate" ;; *) fail "unsafe retention target" ;; esac
    entries=("${entries[@]:1}")
  done
}

prune_series "$backup_root/daily" "$daily_keep"
prune_series "$backup_root/weekly" "$weekly_keep"
prune_series "$backup_root/monthly" "$monthly_keep"

printf '[postgres-backup] completed %s\n' "$final_dir"
