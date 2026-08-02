#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: reconcile-runtime-config-permissions.sh CONFIG_ROOT RUNTIME_USER" >&2
  exit 2
fi

CONFIG_ROOT="$1"
RUNTIME_USER="$2"
case "$CONFIG_ROOT" in
  /*) ;;
  *) echo "[错误] CONFIG_ROOT 必须是绝对路径" >&2; exit 2 ;;
esac
[ "$CONFIG_ROOT" != "/" ] || { echo "[错误] CONFIG_ROOT 不能是根目录" >&2; exit 2; }
[ "$RUNTIME_USER" = "workspace-runtime" ] || { echo "[错误] runtime 用户不受支持" >&2; exit 2; }
[ -d "$CONFIG_ROOT" ]
RUNTIME_ROOT="$(dirname "$CONFIG_ROOT")"
RUNTIME_PARENT="$(dirname "$RUNTIME_ROOT")"
[ "$CONFIG_ROOT" = "$RUNTIME_ROOT/.workspace" ] || { echo "[错误] CONFIG_ROOT 必须是 runtime root 下的 .workspace" >&2; exit 2; }
[ "$RUNTIME_ROOT" != "/" ] || { echo "[错误] runtime root 不能是根目录" >&2; exit 2; }
[ "$RUNTIME_PARENT" != "/" ] || { echo "[错误] runtime parent 不能是根目录" >&2; exit 2; }
[ -d "$RUNTIME_ROOT" ]
[ -d "$RUNTIME_PARENT" ]
id "$RUNTIME_USER" >/dev/null
command -v setfacl >/dev/null
command -v runuser >/dev/null

runtime_traverse_only_targets() {
  local relative target
  for relative in data assets assets/brand; do
    target="$CONFIG_ROOT/$relative"
    [ ! -e "$target" ] || printf '%s\n' "$target"
  done
}

runtime_ro_targets() {
  local relative target
  for relative in config/pharma-qc config/tenant config/hr data/reference assets/brand/company \
    runtime/kimi-agent runtime/kimi-agent-bootstrap; do
    target="$CONFIG_ROOT/$relative"
    [ ! -e "$target" ] || printf '%s\n' "$target"
  done
}

runtime_rw_targets() {
  local relative target
  for relative in library data/docs-editor/templates data/qc-batches.json \
    data/qc-template-feedback.json data/qc.json assets/agent/avatar assets/user/avatar \
    template/hr/position-description-view-templates.json cache/production/qc tmp \
    agent/sessions agent/wecom-bot-state.json runtime/kimi-agent/work runtime/kimi-agent/turns runtime/kimi-agent/home; do
    target="$CONFIG_ROOT/$relative"
    [ ! -e "$target" ] || printf '%s\n' "$target"
  done
}

for target in "$RUNTIME_PARENT" "$RUNTIME_ROOT"; do
  setfacl -m "u:$RUNTIME_USER:--x" "$target"
  runuser -u "$RUNTIME_USER" -- test -x "$target"
  if runuser -u "$RUNTIME_USER" -- test -r "$target" || runuser -u "$RUNTIME_USER" -- test -w "$target"; then
    echo "[错误] runtime 用户可读取或写入 release traverse-only 路径: $target" >&2
    exit 1
  fi
done

setfacl -m "u:$RUNTIME_USER:--x" "$CONFIG_ROOT"
while IFS= read -r target; do setfacl -m "u:$RUNTIME_USER:--x" "$target"; done < <(runtime_traverse_only_targets)
while IFS= read -r target; do
  setfacl -Rm "u:$RUNTIME_USER:rX" "$target"
  [ ! -d "$target" ] || setfacl -Rdm "u:$RUNTIME_USER:rX" "$target"
done < <(runtime_ro_targets)
while IFS= read -r target; do
  setfacl -Rm "u:$RUNTIME_USER:rwX" "$target"
  [ ! -d "$target" ] || setfacl -Rdm "u:$RUNTIME_USER:rwX" "$target"
done < <(runtime_rw_targets)

while IFS= read -r target; do
  runuser -u "$RUNTIME_USER" -- test -x "$target"
  if runuser -u "$RUNTIME_USER" -- test -r "$target" || runuser -u "$RUNTIME_USER" -- test -w "$target"; then
    echo "[错误] runtime 用户可读取或写入 traverse-only 路径: $target" >&2
    exit 1
  fi
done < <(runtime_traverse_only_targets)
while IFS= read -r target; do
  runuser -u "$RUNTIME_USER" -- test -r "$target"
  runuser -u "$RUNTIME_USER" -- test -w "$target"
  [ ! -d "$target" ] || runuser -u "$RUNTIME_USER" -- test -x "$target"
done < <(runtime_rw_targets)
while IFS= read -r target; do
  runuser -u "$RUNTIME_USER" -- test -r "$target"
  [ ! -d "$target" ] || runuser -u "$RUNTIME_USER" -- test -x "$target"
  if runuser -u "$RUNTIME_USER" -- test -w "$target"; then
    echo "[错误] runtime 用户可写只读路径: $target" >&2
    exit 1
  fi
done < <(runtime_ro_targets)

echo "Runtime configuration permissions reconciled."
