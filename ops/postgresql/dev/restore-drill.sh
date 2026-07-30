#!/usr/bin/env bash
set -euo pipefail
umask 077

runtime_root="${WORKSPACE_DEV_POSTGRES_SECURITY_ROOT:-/home/ubuntu/workspace-dev/postgresql-security}"
postgres_image=postgres:15-bookworm

if [[ "$(id -u):$(id -g)" != "1000:1001" ]]; then
  echo "Restore drill must run as host ubuntu uid/gid 1000:1001 so receipts remain operator-owned" >&2
  exit 2
fi
if [[ "${runtime_root}" != /* || ! -r "${runtime_root}/.env" ]]; then
  echo "PostgreSQL security runtime root is missing or invalid" >&2
  exit 2
fi

backup_dir="$(sed -n 's/^WORKSPACE_DEV_BACKUP_DIR=//p' "${runtime_root}/.env" | tail -n 1)"
if [[ "${backup_dir}" != /* || ! -d "${backup_dir}" || ! -w "${backup_dir}" ]]; then
  echo "WORKSPACE_DEV_BACKUP_DIR must be an absolute writable directory" >&2
  exit 2
fi

latest_manifest_line="$(
  find "${backup_dir}" -maxdepth 1 -type f -name 'workspace-dev-*.dump.sha256' \
    -printf '%T@|%p\n' | sort -n | tail -n 1
)"
manifest_path="${latest_manifest_line#*|}"
if [[ -z "${latest_manifest_line}" || ! -r "${manifest_path}" ]]; then
  echo "No verified development backup manifest found" >&2
  exit 1
fi
dump_path="${manifest_path%.sha256}"
inventory_path="${dump_path}.security-inventory"
for artifact_path in "${dump_path}" "${inventory_path}" "${manifest_path}"; do
  if [[ ! -f "${artifact_path}" || "$(stat -c '%u:%g:%a' "${artifact_path}")" != "1000:1001:600" ]]; then
    echo "Backup artifact must be an ubuntu-owned uid/gid 1000:1001 mode-0600 regular file: ${artifact_path}" >&2
    exit 1
  fi
done
(cd "${backup_dir}" && sha256sum --check "$(basename "${manifest_path}")")

drill_id="workspace-dev-restore-drill-$(date -u +%Y%m%dT%H%M%SZ)-$$"
container_name="${drill_id}-db"
volume_name="${drill_id}-data"
restored_inventory="$(mktemp -p "${backup_dir}" .restore-inventory.XXXXXX)"
verification_output="$(mktemp -p "${backup_dir}" .restore-verification.XXXXXX)"
temporary_receipt="$(mktemp -p "${backup_dir}" .restore-receipt.XXXXXX)"
cleanup() {
  docker rm -f "${container_name}" >/dev/null 2>&1 || true
  docker volume rm "${volume_name}" >/dev/null 2>&1 || true
  rm -f -- "${restored_inventory}" "${verification_output}" "${temporary_receipt}"
}
trap cleanup EXIT

docker volume create "${volume_name}" >/dev/null
docker run -d \
  --name "${container_name}" \
  --network none \
  --memory 1g \
  --cpus 1 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --volume "${volume_name}:/var/lib/postgresql/data" \
  --volume "${backup_dir}:/backups:ro" \
  --volume "${runtime_root}/restore-drill-bootstrap.sql:/drill/restore-drill-bootstrap.sql:ro" \
  --volume "${runtime_root}/restore-drill-verify.sql:/drill/restore-drill-verify.sql:ro" \
  --volume "${runtime_root}/security-inventory.sql:/drill/security-inventory.sql:ro" \
  "${postgres_image}" >/dev/null

for attempt in $(seq 1 90); do
  if docker logs "${container_name}" 2>&1 | grep -q 'PostgreSQL init process complete' \
    && docker exec "${container_name}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  if (( attempt == 90 )); then
    docker logs --tail 160 "${container_name}" >&2
    exit 1
  fi
  sleep 1
done
test "$(docker inspect "${container_name}" --format '{{.HostConfig.NetworkMode}}')" = "none"
test "$(docker inspect "${container_name}" --format '{{json .HostConfig.PortBindings}}')" = "{}"

docker exec "${container_name}" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /drill/restore-drill-bootstrap.sql >/dev/null
docker exec "${container_name}" \
  pg_restore -U postgres --exit-on-error --dbname workspace_dev_restore \
  "/backups/$(basename "${dump_path}")" >/dev/null
docker exec "${container_name}" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d workspace_dev_restore -At \
  -f /drill/security-inventory.sql > "${restored_inventory}"
if ! cmp -s "${inventory_path}" "${restored_inventory}"; then
  echo "Restored security inventory differs from the backup inventory" >&2
  diff -u "${inventory_path}" "${restored_inventory}" | sed -n '1,120p' >&2
  exit 1
fi
docker exec "${container_name}" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d workspace_dev_restore -AtF '|' \
  -f /drill/restore-drill-verify.sql > "${verification_output}"
if ! awk -F '|' 'NF != 2 || $2 != "t" { failed = 1 } END { exit(failed || NR != 8) }' "${verification_output}"; then
  echo "One or more isolated restore checks failed" >&2
  sed -n '1,120p' "${verification_output}" >&2
  exit 1
fi

receipt_dir="${backup_dir}/restore-receipts"
install -d -m 0700 "${receipt_dir}"
receipt_path="${receipt_dir}/${drill_id}.receipt"
manifest_checksum="$(sha256sum "${manifest_path}" | awk '{print $1}')"
dump_checksum="$(sha256sum "${dump_path}" | awk '{print $1}')"
inventory_checksum="$(sha256sum "${inventory_path}" | awk '{print $1}')"
verification_checksum="$(sha256sum "${verification_output}" | awk '{print $1}')"
image_id="$(docker image inspect "${postgres_image}" --format '{{.Id}}')"
docker rm -f "${container_name}" >/dev/null
docker volume rm "${volume_name}" >/dev/null
if docker inspect "${container_name}" >/dev/null 2>&1 || docker volume inspect "${volume_name}" >/dev/null 2>&1; then
  echo "Isolated restore resources were not removed" >&2
  exit 1
fi
{
  printf 'status=passed\n'
  printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'backup=%s\n' "$(basename "${dump_path}")"
  printf 'manifest_sha256=%s\n' "${manifest_checksum}"
  printf 'dump_sha256=%s\n' "${dump_checksum}"
  printf 'security_inventory_sha256=%s\n' "${inventory_checksum}"
  printf 'restore_verification_sha256=%s\n' "${verification_checksum}"
  printf 'postgres_image=%s\n' "${postgres_image}"
  printf 'postgres_image_id=%s\n' "${image_id}"
  printf 'isolation=network-none,no-published-ports,new-volume,resources-removed\n'
  printf 'security_inventory_match=passed\n'
  printf 'checks=pg_restore,security_inventory,roles,ownership,acl,constraints,migration_ledger,runtime_denials\n'
} > "${temporary_receipt}"
chmod 0600 "${temporary_receipt}"
mv "${temporary_receipt}" "${receipt_path}"
cleanup
trap - EXIT

echo "isolated restore drill passed; receipt=${receipt_path}"
