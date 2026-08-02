prepare_remote_runtime() {
  echo "==> 准备服务器运行态配置..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR'
    mkdir -p '$REMOTE_DIR/releases'
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR'
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- test -r '$REMOTE_CONTROL_ENV_FILE'
      sudo -n -- test -r '$REMOTE_RUNTIME_ENV_FILE'
    else
      if [ ! -f '$REMOTE_CONTROL_ENV_FILE' ]; then
        if [ -f '$REMOTE_DIR/.env' ]; then
          cp '$REMOTE_DIR/.env' '$REMOTE_CONTROL_ENV_FILE'
        elif [ -n '$ENV_CONTENT_B64' ]; then
          printf '%s' '$ENV_CONTENT_B64' | base64 -d > '$REMOTE_CONTROL_ENV_FILE'
        else
          echo '[错误] 服务器缺少运行态 .env，且未提供 ENV_CONTENT'
          exit 1
        fi
      fi
    fi
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/data'
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db' ] && [ -d '$REMOTE_DIR/data' ]; then
      rsync -a '$REMOTE_DIR/data/' '$REMOTE_WORKSPACE_CONFIG_DIR/data/'
    fi

    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'legacy' ]; then
    python3 - <<'PY'
from pathlib import Path
import re

env_path = Path('$REMOTE_CONTROL_ENV_FILE')
text = env_path.read_text()
replacements = {
    'WORKSPACE_CONFIG_DIR': '$REMOTE_WORKSPACE_CONFIG_DIR',
    'LIBRARY_SOURCE_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals',
    'LIBRARY_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library',
}
obsolete_agent_keys = {
    'AGENT_MODEL_PROVIDER',
    'KIMI_API_KEY',
    'KIMI_BASE_URL',
    'KIMI_MODEL',
    'KIMI_MAX_TOKENS',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
    'AGENT_SOURCE_WORKTREE',
    'AGENT_SOURCE_CACHE_DIR',
    'AGENT_SOURCE_REPO_URL',
    'AGENT_SOURCE_BRANCH',
    'CNB_PR_TOKEN',
    'CNB_PR_REPO',
    'CNB_PR_BRANCH_PREFIX',
    'CNB_PR_GIT_AUTHOR_NAME',
    'CNB_PR_GIT_AUTHOR_EMAIL',
}
retired_agent_lines = [
    line for line in text.splitlines()
    if any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
]
if retired_agent_lines:
    retired_dir = env_path.parent / 'retired'
    retired_dir.mkdir(mode=0o700, exist_ok=True)
    retired_path = retired_dir / 'agent-provider.env'
    if not retired_path.exists():
        retired_path.write_text('\n'.join(retired_agent_lines) + '\n')
        retired_path.chmod(0o600)
text = '\n'.join(
    line for line in text.splitlines()
    if not any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
) + '\n'
for key, value in replacements.items():
    line = f'{key}={value}'
    if re.search(rf'^{key}=.*$', text, flags=re.M):
        text = re.sub(rf'^{key}=.*$', line, text, flags=re.M)
    else:
        text = text.rstrip() + '\\n' + line + '\\n'
env_path.write_text(text)
PY
    fi
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- '$REMOTE_DEPLOY_TOOL_DIR/reconcile-runtime-config-permissions.sh' \
        '$REMOTE_WORKSPACE_CONFIG_DIR' workspace-runtime
    fi
  "
}

sync_remote_library_source() {
  if [ -z "$LIBRARY_SYNC_SOURCE" ]; then
    echo "==> 未配置 LIBRARY_SYNC_SOURCE；沿用服务器持久化资料库"
    return
  fi
  if [ ! -d "$LIBRARY_SYNC_SOURCE" ]; then
    echo "[错误] LIBRARY_SYNC_SOURCE 不是可读目录: $LIBRARY_SYNC_SOURCE"
    exit 1
  fi
  echo "==> 同步资料库源文件到服务器只读导入目录..."
  ssh_cmd "mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals'"
  rsync -az --checksum --exclude='.versions/' \
    -e "$RSYNC_SSH_COMMAND" \
    "$LIBRARY_SYNC_SOURCE/" "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/library/originals/"
}

ensure_remote_library_runtime_deps() {
  if [ "$INSTALL_LIBRARY_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过服务器 OCR/PDF 依赖安装（INSTALL_LIBRARY_RUNTIME_DEPS=${INSTALL_LIBRARY_RUNTIME_DEPS}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/library-worker"
  echo "==> 同步并安装服务器 OCR/PDF 依赖..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-library-runtime-deps.sh \
    ops/install-library-embedding-model.sh \
    ops/library-worker-requirements.txt \
    ops/library-runtime-smoke.py \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-library-runtime-deps.sh' '$remote_tool_dir/install-library-embedding-model.sh' '$remote_tool_dir/library-runtime-smoke.py'
    runtime_digest=\$(sha256sum \
      '$remote_tool_dir/install-library-runtime-deps.sh' \
      '$remote_tool_dir/install-library-embedding-model.sh' \
      '$remote_tool_dir/library-worker-requirements.txt' \
      '$remote_tool_dir/library-runtime-smoke.py' | sha256sum | awk '{print \$1}')
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && '$remote_tool_dir/install-library-runtime-deps.sh' --server --quick-check \
      && '$remote_tool_dir/install-library-embedding-model.sh' --quick-check; then
      echo '==> Library/Qwen 运行时 source/version 未变化，跳过网络安装和模型加载'
    else
      '$remote_tool_dir/install-library-runtime-deps.sh' --server
      '$remote_tool_dir/install-library-embedding-model.sh'
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

ensure_remote_kimi_agent_runtime() {
  if [ "$INSTALL_KIMI_AGENT_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过 Kimi Agent SDK 运行时安装（INSTALL_KIMI_AGENT_RUNTIME_DEPS=${INSTALL_KIMI_AGENT_RUNTIME_DEPS}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap"
  echo "==> 同步并校验 Kimi Agent SDK 隔离运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-kimi-agent-runtime.sh \
    ops/kimi-agent-sandbox-runner.sh \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-kimi-agent-runtime.sh' '$remote_tool_dir/kimi-agent-sandbox-runner.sh'
    runtime_digest=\$(sha256sum \
      '$remote_tool_dir/install-kimi-agent-runtime.sh' \
      '$remote_tool_dir/kimi-agent-sandbox-runner.sh' | sha256sum | awk '{print \$1}')
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check; then
      echo '==> Kimi Agent 隔离运行时 source/version 未变化，跳过网络安装'
    else
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh'
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

ensure_remote_onlyoffice_runtime() {
  if [ "$INSTALL_ONLYOFFICE_RUNTIME" != "1" ]; then
    echo "==> 跳过 ONLYOFFICE 运行时安装（INSTALL_ONLYOFFICE_RUNTIME=${INSTALL_ONLYOFFICE_RUNTIME}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/onlyoffice-bootstrap"
  echo "==> 同步并校验 ONLYOFFICE 只读预览运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir/onlyoffice'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-onlyoffice-runtime.sh \
    "$SERVER:$remote_tool_dir/"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/onlyoffice/docker-compose.yml \
    "$SERVER:$remote_tool_dir/onlyoffice/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-onlyoffice-runtime.sh'
    load_runtime_environment
    calculate_runtime_digest() {
      {
        sha256sum \
          '$remote_tool_dir/install-onlyoffice-runtime.sh' \
          '$remote_tool_dir/onlyoffice/docker-compose.yml'
        printf 'ONLYOFFICE_IMAGE=%s\\n' \"\${ONLYOFFICE_IMAGE:-onlyoffice/documentserver:9.4.0}\"
        printf 'ONLYOFFICE_PORT=%s\\n' \"\${ONLYOFFICE_PORT:-8082}\"
        printf 'ONLYOFFICE_NGINX_SITE=%s\\n' \"\${ONLYOFFICE_NGINX_SITE:-auto}\"
        printf '%s' \"\${ONLYOFFICE_JWT_SECRET:-missing}\" | sha256sum
      } | sha256sum | awk '{print \$1}'
    }
    runtime_digest=\$(calculate_runtime_digest)
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh' --check; then
      echo '==> ONLYOFFICE source/version 未变化且健康，跳过 compose reconcile'
    else
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh'
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh' --check
      load_runtime_environment
      runtime_digest=\$(calculate_runtime_digest)
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}
