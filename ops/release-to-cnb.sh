#!/usr/bin/env bash
set -euo pipefail

echo "[错误] 旧 CNB 分段发布入口已删除。CNB 只能作为与 local 相同 ci/deploy 合同的执行渠道；当前请使用 ops/publish.sh ci 或 deploy。" >&2
exit 2
