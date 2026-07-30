#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHASE="${1:-}"
FINANCE_ENV_FILE="${2:-}"
BACKUP_DIR="${WORKSPACE_PG_SECURITY_BACKUP_DIR:-}"
CONFIG_ROOT="${WORKSPACE_CONFIG_ROOT:-/home/ubuntu/workspace/.workspace}"
SERVICE="finance-bot.service"
SOURCE_SCRIPT="/usr/local/bin/finance-bot.py"
HARDENED_ROOT="/usr/local/lib/workspace-security"
HARDENED_SCRIPT="$HARDENED_ROOT/finance-bot.py"
DROPIN_ROOT="/etc/systemd/system/finance-bot.service.d"
DROPIN_FILE="$DROPIN_ROOT/workspace-postgresql-security.conf"
SNAPSHOT_MARKER="$BACKUP_DIR/finance-hook.snapshot"

case "$PHASE" in prepare|apply|verify|rollback) ;; *) echo "用法: $0 prepare|apply|verify|rollback ENV_FILE" >&2; exit 2 ;; esac
[ "$(id -u)" -eq 0 ] || { echo "[错误] finance bot hook 必须由 root 执行" >&2; exit 77; }
case "$FINANCE_ENV_FILE:$BACKUP_DIR:$CONFIG_ROOT" in /*:/*:/*) ;; *) echo "[错误] finance bot hook 路径必须为绝对路径" >&2; exit 2 ;; esac
for command in node python3 systemctl install mktemp cmp; do
  command -v "$command" >/dev/null || { echo "[错误] finance bot hook 缺少命令: $command" >&2; exit 1; }
done
[ -f "$SOURCE_SCRIPT" ] || { echo "[错误] 缺少 finance bot 脚本" >&2; exit 1; }
systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "[错误] 缺少 finance-bot.service" >&2; exit 1; }
[ "$(systemctl show "$SERVICE" -p User --value)" = ubuntu ] || { echo "[错误] finance bot 必须保留 User=ubuntu" >&2; exit 1; }

backup_optional() {
  local source=$1 label=$2
  if [ -e "$source" ] && [ ! -f "$source" ]; then echo "[错误] 非普通文件: $source" >&2; exit 1; fi
  if [ -f "$source" ]; then
    install -m 0600 "$source" "$BACKUP_DIR/$label"
    install -m 0600 /dev/null "$BACKUP_DIR/$label.present"
  else
    install -m 0600 /dev/null "$BACKUP_DIR/$label.absent"
  fi
}
restore_optional() {
  local label=$1 target=$2 mode=$3
  if [ -f "$BACKUP_DIR/$label.present" ]; then
    install -o root -g root -m "$mode" "$BACKUP_DIR/$label" "$target"
  elif [ -f "$BACKUP_DIR/$label.absent" ]; then
    rm -f "$target"
  else
    echo "[错误] finance bot rollback 缺少 $label snapshot" >&2
    exit 1
  fi
}
validate_source_contract() {
  grep -F 'def get_workspace_database_url():' "$SOURCE_SCRIPT" >/dev/null || { echo "[错误] finance bot DB helper 契约漂移" >&2; exit 1; }
  grep -F "WORKSPACE_ENV = \"$CONFIG_ROOT/.env\"" "$SOURCE_SCRIPT" >/dev/null || { echo "[错误] finance bot 共享 env 常量契约漂移" >&2; exit 1; }
}

if [ "$PHASE" = prepare ]; then
  validate_source_contract
  if [ -f "$SNAPSHOT_MARKER" ]; then
    cmp --silent "$SOURCE_SCRIPT" "$BACKUP_DIR/finance-bot.py.before" || { echo "[错误] finance bot 脚本在 prepare 后漂移" >&2; exit 1; }
  else
    install -m 0600 "$SOURCE_SCRIPT" "$BACKUP_DIR/finance-bot.py.before"
    backup_optional "$HARDENED_SCRIPT" finance-bot-hardened.before
    backup_optional "$DROPIN_FILE" finance-bot-dropin.before
    install -m 0600 /dev/null "$SNAPSHOT_MARKER"
  fi
  exit 0
fi

if [ "$PHASE" = apply ]; then
  [ -f "$SNAPSHOT_MARKER" ] || { echo "[错误] finance bot apply 缺少 prepare snapshot" >&2; exit 1; }
  cmp --silent "$SOURCE_SCRIPT" "$BACKUP_DIR/finance-bot.py.before" || { echo "[错误] finance bot 脚本 digest 漂移" >&2; exit 1; }
  validate_source_contract
  install -d -o root -g root -m 0755 "$HARDENED_ROOT" "$DROPIN_ROOT"
  temporary="$(mktemp /tmp/finance-bot-hardened.XXXXXX)"
  SOURCE_SCRIPT="$SOURCE_SCRIPT" OUTPUT_SCRIPT="$temporary" CONFIG_ROOT="$CONFIG_ROOT" node - <<'NODE'
const fs = require("node:fs");
let source = fs.readFileSync(process.env.SOURCE_SCRIPT, "utf8");
const oldConstant = `WORKSPACE_ENV = "${process.env.CONFIG_ROOT}/.env"`;
if (source.split(oldConstant).length !== 2) process.exit(2);
source = source.replace(oldConstant, 'WORKSPACE_ENV = ""');
const marker = "def get_workspace_database_url():\n";
if (source.split(marker).length !== 2) process.exit(3);
const injection = marker
  + '    database_url = os.environ.get("WORKSPACE_DATABASE_URL", "").strip()\n'
  + '    if database_url.startswith(("postgresql://", "postgres://")):\n'
  + '        return database_url\n';
source = source.replace(marker, injection);
fs.writeFileSync(process.env.OUTPUT_SCRIPT, source, {mode: 0o700});
NODE
  python3 - "$temporary" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
compile(path.read_text(), str(path), "exec")
PY
  if grep -F "$CONFIG_ROOT/.env" "$temporary" >/dev/null; then
    rm -f "$temporary"
    echo "[错误] hardened finance bot 仍引用共享 env" >&2
    exit 1
  fi
  install -o root -g root -m 0755 "$temporary" "$HARDENED_SCRIPT"
  rm -f "$temporary"
  install -o root -g root -m 0644 "$SCRIPT_DIR/production-finance-bot.conf" "$DROPIN_FILE"
  systemctl daemon-reload
  systemctl restart "$SERVICE"
  systemctl is-active --quiet "$SERVICE"
  exit 0
fi

if [ "$PHASE" = verify ]; then
  [ -f "$FINANCE_ENV_FILE" ] || { echo "[错误] finance bot 专用 env 不存在" >&2; exit 1; }
  [ "$(stat -c %U:%G:%a "$FINANCE_ENV_FILE")" = root:root:600 ] || { echo "[错误] finance bot env 必须 root:root 0600" >&2; exit 1; }
  FINANCE_ENV_FILE="$FINANCE_ENV_FILE" node - <<'NODE'
const fs = require("node:fs");
const lines = fs.readFileSync(process.env.FINANCE_ENV_FILE, "utf8").split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith("#"));
if (lines.length !== 1 || !/^WORKSPACE_DATABASE_URL=postgres(?:ql)?:\/\//.test(lines[0])) process.exit(1);
NODE
  systemctl cat "$SERVICE" | grep -F "$FINANCE_ENV_FILE" >/dev/null || { echo "[错误] finance bot 未加载专用 env" >&2; exit 1; }
  systemctl show "$SERVICE" -p ExecStart --value | grep -F "$HARDENED_SCRIPT" >/dev/null || { echo "[错误] finance bot 未运行 hardened script" >&2; exit 1; }
  grep -F 'os.environ.get("WORKSPACE_DATABASE_URL"' "$HARDENED_SCRIPT" >/dev/null || { echo "[错误] finance bot 未从专用变量读取 DB URL" >&2; exit 1; }
  if grep -F "$CONFIG_ROOT/.env" "$HARDENED_SCRIPT" >/dev/null; then echo "[错误] finance bot 仍读取共享 env" >&2; exit 1; fi
  systemctl is-active --quiet "$SERVICE" || { echo "[错误] finance bot 未运行" >&2; exit 1; }
  main_pid="$(systemctl show "$SERVICE" -p MainPID --value)"
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] || { echo "[错误] finance bot 无有效 MainPID" >&2; exit 1; }
  tr '\0' '\n' < "/proc/$main_pid/environ" | grep -Eq '^WORKSPACE_DATABASE_URL=postgres(ql)?://' || { echo "[错误] finance bot 进程未继承专用 DB URL" >&2; exit 1; }
  exit 0
fi

systemctl stop "$SERVICE" 2>/dev/null || true
restore_optional finance-bot-hardened.before "$HARDENED_SCRIPT" 0755
restore_optional finance-bot-dropin.before "$DROPIN_FILE" 0644
systemctl daemon-reload
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"
