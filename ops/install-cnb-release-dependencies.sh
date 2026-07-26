#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if bash ./ops/cnb-release-artifact-cache.sh restore; then
  echo "==> 已验证不可变 artifact，跳过 npm ci"
  exit 0
fi

npm ci --no-audit --fund=false --loglevel=error
