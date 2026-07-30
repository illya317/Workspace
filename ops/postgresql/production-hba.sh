#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-final}"
case "$MODE" in transition|final) ;; *) echo "用法: $0 transition|final" >&2; exit 2 ;; esac
cat <<'EOF'
# BEGIN WORKSPACE MANAGED POSTGRESQL ACCESS
local   all         postgres                                      peer
hostssl workspace   workspace_runtime    127.0.0.1/32             scram-sha-256
hostssl workspace   workspace_backup     127.0.0.1/32             scram-sha-256
hostssl workspace   workspace_monitor    127.0.0.1/32             scram-sha-256
hostssl workspace   workspace_migrator   127.0.0.1/32             scram-sha-256
hostssl natsu       natsu_app            127.0.0.1/32             scram-sha-256
hostssl workspace   workspace_runtime    ::1/128                  scram-sha-256
hostssl workspace   workspace_backup     ::1/128                  scram-sha-256
hostssl workspace   workspace_monitor    ::1/128                  scram-sha-256
hostssl workspace   workspace_migrator   ::1/128                  scram-sha-256
hostssl natsu       natsu_app            ::1/128                  scram-sha-256
EOF
if [ "$MODE" = transition ]; then
cat <<'EOF'
hostssl workspace   workspace_app        127.0.0.1/32             scram-sha-256
hostssl workspace   workspace_app        ::1/128                  scram-sha-256
EOF
fi
cat <<'EOF'
local   all         all                                             reject
host    all         all                  127.0.0.1/32              reject
host    all         all                  ::1/128                   reject
# END WORKSPACE MANAGED POSTGRESQL ACCESS
EOF
