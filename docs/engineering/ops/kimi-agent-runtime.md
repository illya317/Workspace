# Kimi Agent SDK Runtime

Workspace 页面助手与企业微信内部助手统一使用 `@moonshot-ai/kimi-agent-sdk@0.1.8`，生产 CLI 固定为 `kimi-cli==1.48.0`，Wire 协议固定为 `1.10`。版本任一不匹配时 runtime 失败关闭，不自动回退到旧 provider 或另一模型。

## 安全边界

- Platform 在启动 SDK 前按 `agentAllowedActions + SessionUser RBAC` 过滤工具；每次 Wire tool call 再授权一次。
- 自定义 Kimi agent 的 `tools` 和 `subagents` 均为空。CLI 内置 Shell、文件、MCP、插件、后台任务和子 Agent 不进入模型工具集；Wire `PreToolUse` 还会阻断所有非本轮 Workspace allowlist 工具。
- 写工具只能生成 proposal。SDK 不注册 proposal confirm executor；用户确认由独立 Workspace API 重新鉴权后执行。
- SDK 会继承父进程环境，因此生产 executable 必须是 `kimi-agent-sandbox-runner.sh`。runner 的 shebang 在 Bash 启动前清空环境，再通过 Bubblewrap 二次 `--clearenv`，只挂载专用 runtime、空 workdir 和 Kimi 凭据目录；应用 `.env`、数据库、源码和服务器 home 不可见。
- Web 和企业微信共用 3 个活跃 turn 槽位，为 Coding Plan 的 4 并发额度保留 1 个余量。

## 安装与登录

生产 Ubuntu/Debian 服务器执行：

```bash
export WORKSPACE_CONFIG_DIR=/home/ubuntu/workspace/.workspace
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --login
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --check
```

在完整源码 checkout 中也可使用等价的 `npm run agent:runtime:install|login|check`。首次生产部署会先同步 bootstrap 脚本和安装 runtime；Coding Plan 设备登录是唯一需要人工完成的激活步骤。

`--check` 会让固定 CLI 的 `--version` 真正经过 Bubblewrap 执行，因此会同时阻断版本错误、缺少 user namespace 或 sandbox 挂载失败。`agent:runtime:login` 使用官方设备登录流程授权公司 Coding Plan 账号。凭据只保存在：

```text
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent/share
```

不要把该目录复制到构建产物、日志、`.env` 或个人 home。部署会保留该运行态目录，只更新固定 CLI 和 sandbox runner。

## 部署与回滚

`ops/deploy.sh` 默认安装/校验 Kimi runtime，并从服务器 `.env` 删除已废弃的 `AGENT_MODEL_PROVIDER`、`KIMI_*` API 直连项和 `DEEPSEEK_*`。首次迁移会先把这些旧值移到不加载、权限为 `0600` 的 `$WORKSPACE_CONFIG_DIR/retired/agent-provider.env`，随后随运行态备份保留；standalone 产物显式携带 SDK 依赖树。

回滚只能回滚到同时包含旧代码和从 retired 文件人工恢复的旧 provider 配置的完整 release；不能让新代码读取旧密钥。若 Kimi runtime 未登录、版本漂移或 sandbox 不可用，请保持服务运行但让 Agent 请求失败关闭，修复 runtime 后再恢复，不得绕过 Bubblewrap 直接指向真实 `kimi`。

`MoonshotAI/kimi-cli` 正在逐步迁移到新 Kimi Code CLI；当前 Node Agent SDK 仍依赖本运行时的 Wire 协议。升级前必须重新做 SDK/CLI/Wire 冒烟，不得单独升级任一版本。
