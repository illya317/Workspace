#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_root="${WORKSPACE_POSTGRESQL_BACKUP_ROOT:-/var/backups/workspace/postgresql}"
receipt_root="${WORKSPACE_POSTGRESQL_RESTORE_RECEIPT_ROOT:-/var/lib/workspace/postgresql-restore-drills}"
image="${WORKSPACE_POSTGRESQL_RESTORE_IMAGE:-postgres:16.14-bookworm}"
database_name="${WORKSPACE_POSTGRESQL_DATABASE:-workspace}"
backup_dir="${1:-}"

fail() {
  printf '[postgres-restore-drill] %s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "restore drill must run as root"
for path in "$backup_root" "$receipt_root"; do
  case "$path" in /*) ;; *) fail "all roots must be absolute" ;; esac
  [ "$path" != / ] || fail "root path must not be /"
done
[[ "$database_name" =~ ^[A-Za-z0-9_]+$ ]] || fail "invalid database name"

if [ -z "$backup_dir" ]; then
  [ -L "$backup_root/latest" ] || fail "latest backup link is missing"
  backup_dir="$(readlink -f "$backup_root/latest")"
fi
backup_dir="$(readlink -f "$backup_dir")"
case "$backup_dir" in "$backup_root"/daily/*) ;; *) fail "backup path is outside the daily backup root" ;; esac
[ -f "$backup_dir/manifest.json" ] || fail "manifest is missing"
[ -f "$backup_dir/SHA256SUMS" ] || fail "checksum file is missing"

(
  cd "$backup_dir"
  sha256sum --check SHA256SUMS >/dev/null
)
python3 - "$backup_dir/manifest.json" "$database_name" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
if payload.get("kind") != "workspace-postgresql-logical-backup":
    raise SystemExit("unexpected backup kind")
if payload.get("database") != sys.argv[2]:
    raise SystemExit("unexpected database")
if payload.get("globals", {}).get("rolePasswordsIncluded") is not False:
    raise SystemExit("globals export password contract is invalid")
PY

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
suffix="${stamp,,}-$$"
container="workspace-pg-restore-drill-$suffix"
volume="workspace-pg-restore-drill-$suffix-data"
label="com.fh-bio.workspace.postgresql-restore-drill=$suffix"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
install -d -m 0700 "$receipt_root"

docker container inspect "$container" >/dev/null 2>&1 && fail "container already exists"
docker volume inspect "$volume" >/dev/null 2>&1 && fail "volume already exists"
docker image inspect "$image" >/dev/null
docker volume create --label "$label" "$volume" >/dev/null

cleanup() {
  if docker container inspect "$container" >/dev/null 2>&1; then
    actual="$(docker inspect "$container" --format '{{ index .Config.Labels "com.fh-bio.workspace.postgresql-restore-drill" }}')"
    [ "$actual" = "$suffix" ] && docker rm -f "$container" >/dev/null
  fi
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    actual="$(docker volume inspect "$volume" --format '{{ index .Labels "com.fh-bio.workspace.postgresql-restore-drill" }}')"
    [ "$actual" = "$suffix" ] && docker volume rm "$volume" >/dev/null
  fi
}
trap cleanup EXIT

docker run -d \
  --name "$container" \
  --label "$label" \
  --network none \
  --restart no \
  --memory 2g \
  --cpus 1.5 \
  --pids-limit 512 \
  --security-opt no-new-privileges:true \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=postgres \
  --volume "$volume:/var/lib/postgresql/data" \
  --volume "$backup_dir:/backup:ro" \
  "$image" >/dev/null

for attempt in $(seq 1 90); do
  if docker exec "$container" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 90 ]; then
    docker logs "$container" --tail 120 >&2
    fail "temporary PostgreSQL did not become ready"
  fi
  sleep 1
done

docker exec "$container" createdb -U postgres restore_drill
docker exec "$container" pg_restore \
  -U postgres \
  -d restore_drill \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "/backup/${database_name}.dump"

validation="$(docker exec -i "$container" psql -X -U postgres -d restore_drill -v ON_ERROR_STOP=1 -At -F '|' <<'SQL'
select current_setting('server_version'),
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
       (select count(*) from "_prisma_migrations" where finished_at is not null and rolled_back_at is null),
       (select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated),
       (select count(*) from "User");
SQL
)"
IFS='|' read -r server_version table_count migration_count invalid_constraint_count user_count <<<"$validation"
[ "$table_count" -gt 0 ] || fail "restored database has no public tables"
[ "$migration_count" -gt 0 ] || fail "restored database has no applied migrations"
[ "$invalid_constraint_count" -eq 0 ] || fail "restored database has invalid constraints"

image_id="$(docker image inspect "$image" --format '{{.Id}}')"
network_mode="$(docker inspect "$container" --format '{{.HostConfig.NetworkMode}}')"
port_bindings="$(docker inspect "$container" --format '{{json .HostConfig.PortBindings}}')"
[ "$network_mode" = none ] || fail "restore container is not network-isolated"
[ "$port_bindings" = '{}' ] || fail "restore container unexpectedly publishes ports"
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
receipt="$receipt_root/${stamp}-$$.json"
python3 - "$receipt" "$started_at" "$finished_at" "$backup_dir" "$image" "$image_id" "$server_version" "$table_count" "$migration_count" "$invalid_constraint_count" "$user_count" <<'PY'
import json
import os
import sys
(
    path,
    started_at,
    finished_at,
    backup_dir,
    image,
    image_id,
    server_version,
    table_count,
    migration_count,
    invalid_constraint_count,
    user_count,
) = sys.argv[1:]
payload = {
    "schemaVersion": 1,
    "kind": "workspace-postgresql-restore-drill-receipt",
    "status": "passed",
    "startedAt": started_at,
    "finishedAt": finished_at,
    "backupDirectory": backup_dir,
    "image": image,
    "imageId": image_id,
    "networkMode": "none",
    "publishedPorts": False,
    "serverVersion": server_version,
    "validation": {
        "publicTableCount": int(table_count),
        "appliedMigrationCount": int(migration_count),
        "invalidConstraintCount": int(invalid_constraint_count),
        "userCount": int(user_count),
    },
}
temporary = path + ".tmp"
with open(temporary, "x", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY
sha256sum "$receipt" >"$receipt.sha256"
chmod 0600 "$receipt" "$receipt.sha256"
printf '[postgres-restore-drill] passed %s\n' "$receipt"
