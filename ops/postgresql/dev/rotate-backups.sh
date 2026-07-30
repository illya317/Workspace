#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:-/backups}"
retention_days="${2:-7}"

if [[ "${backup_dir}" != "/backups" ]]; then
  echo "Refusing unexpected backup directory: ${backup_dir}" >&2
  exit 2
fi
if [[ ! "${retention_days}" =~ ^[0-9]+$ ]] || (( retention_days < 7 )); then
  echo "Retention must be an integer of at least 7 days" >&2
  exit 2
fi

find "${backup_dir}" -maxdepth 1 -type f \
  \( -name 'workspace-dev-*.dump' \
     -o -name 'workspace-dev-*.dump.sha256' \
     -o -name 'workspace-dev-*.dump.security-inventory' \) \
  -mtime "+${retention_days}" -print -delete
