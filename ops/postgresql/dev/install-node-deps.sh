#!/usr/bin/env bash
set -euo pipefail

cd /workspace

mkdir -p .cache/container
lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
stamp_file=".cache/container/package-lock.sha256"

if [[ ! -d node_modules ]] \
  || [[ ! -f "${stamp_file}" ]] \
  || [[ "$(<"${stamp_file}")" != "${lock_hash}" ]]; then
  npm ci --no-audit --no-fund
  printf '%s\n' "${lock_hash}" > "${stamp_file}"
fi
