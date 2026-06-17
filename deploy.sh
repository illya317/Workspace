#!/bin/bash
set -euo pipefail

cat >&2 <<'MSG'
[错误] 生产部署不再从本机直连服务器执行。

请提交代码后 push 到 CNB，由 .cnb.yml 在 CNB/Linux 容器里构建并部署。
服务器连接信息只允许通过 CNB imports/环境变量注入。
MSG

exit 1
