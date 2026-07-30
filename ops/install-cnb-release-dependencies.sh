#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${RELEASE_ACTION:-deploy}" = "deploy" ]; then
  echo "==> deploy 复用已验证 artifact bundle；跳过 npm ci"
  exit 0
fi
npm ci --no-audit --fund=false --loglevel=error
