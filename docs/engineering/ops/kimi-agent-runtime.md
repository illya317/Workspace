# Kimi Agent SDK Runtime

Workspace 页面助手与企业微信内部助手统一使用 `@moonshot-ai/kimi-agent-sdk@0.1.8`，生产 CLI 固定为 `kimi-cli==1.48.0`，Wire 协议固定为 `1.10`。版本任一不匹配时 runtime 失败关闭，不自动回退到旧 provider 或另一模型。

## 安全边界

- Platform 在启动 SDK 前按 `agentAllowedActions + SessionUser RBAC` 过滤工具；每次 Wire tool call 再授权一次。
- 自定义 Kimi agent 的 `tools` 和 `subagents` 均为空。CLI 内置 Shell、文件、MCP、插件、后台任务和子 Agent 不进入模型工具集；Wire `PreToolUse` 还会阻断所有非本轮 Workspace allowlist 工具。
- 写工具只能生成 proposal。SDK 不注册 proposal confirm executor；用户确认由独立 Workspace API 重新鉴权后执行。
- SDK 会继承父进程环境，因此生产 executable 必须是 `kimi-agent-sandbox-runner.sh`。runner 的 shebang 在 Bash 启动前清空环境，再通过 Bubblewrap 二次 `--clearenv`，只挂载专用 runtime、空 workdir 和 Kimi 凭据目录；应用 `.env`、数据库、源码和服务器 home 不可见。
- Web 和企业微信共用 3 个活跃 turn 槽位；这是 Workspace 自身的硬上限，不因选择 OAuth 或 API Key 而放宽。

## 流式传输

- `/api/agent` 与 `/api/integrations/wecom/agent` 都返回 `application/x-ndjson`，事件固定为 `status / delta / heartbeat / result`。调用方必须持续读取到唯一的 `result`，不能再按单个 JSON body 解析。
- Platform 每 15 秒发送 heartbeat，响应带 `Cache-Control: no-cache, no-transform` 和 `X-Accel-Buffering: no`。这条 heartbeat 独立于模型文本输出，因为连续工具调用可能长时间没有 `ContentPart`。
- 网页 fetch 取消或企业微信 worker 超时必须向下游 AbortSignal 传播；Kimi turn 上限仍为 15 分钟，企业微信 bridge 客户端上限为 16 分钟，只为最后清理保留余量。
- 企业微信 worker 部署产物必须同时包含 `wecom-agent-bot.mjs`、`wecom-agent-delivery.mjs`、`wecom-agent-input.mjs` 与 `wecom-agent-stream.mjs`。

## 安装与认证

生产 Ubuntu/Debian 服务器执行：

```bash
export WORKSPACE_CONFIG_DIR=/home/ubuntu/workspace/.workspace
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --login
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --check
```

在完整源码 checkout 中也可使用等价的 `npm run agent:runtime:install|login|check`。首次生产部署会先同步 bootstrap 脚本和安装 runtime；模型认证是唯一需要人工完成的激活步骤。

`--login` 使用固定 CLI 的官方配置向导，可选择：

- `Kimi Code`：浏览器 OAuth，使用 Coding Plan 订阅；
- `Moonshot AI Open Platform (moonshot.ai)`：输入 API Key，使用 `https://api.moonshot.ai/v1` 与 API 账户计费，不需要 OAuth。

API Key 只在服务器终端的官方向导中输入，不写入 Workspace `.env`，也不要通过聊天、命令参数或日志传递。向导配置与 OAuth 凭据都只保存在：

```text
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent/share
```

不要把该目录复制到构建产物、日志、`.env` 或个人 home。目录和新建凭据使用仅 owner 可访问的权限；部署会保留该运行态目录，只更新固定 CLI 和 sandbox runner。

`--check` 会让固定 CLI 的 `--version` 真正经过 Bubblewrap 执行，因此会同时阻断版本错误、缺少 user namespace 或 sandbox 挂载失败；它还会沿 `default_model -> model -> provider` 校验当前认证，只接受 Kimi 官方 Coding/API endpoint，并仅输出 provider 和 credential 类型，不输出密钥。

Ubuntu 24.04 默认用 AppArmor 限制未授权进程创建 user namespace。安装脚本不会全局关闭该保护；它把系统 `bwrap` 复制为 root 持有的 Workspace 专用 executable，并只为这个固定路径加载带 `userns` 权限的 AppArmor profile。runner 不调用通用 `/usr/bin/bwrap`，避免把例外扩散到服务器上的其他进程。

## 部署与回滚

`ops/deploy.sh` 默认安装/校验 Kimi runtime，并从服务器 `.env` 删除已废弃的 `AGENT_MODEL_PROVIDER`、`KIMI_*` API 直连项和 `DEEPSEEK_*`。新的 API Key 由专用 CLI 配置持有，不重新放回应用环境。首次迁移会先把旧值移到不加载、权限为 `0600` 的 `$WORKSPACE_CONFIG_DIR/retired/agent-provider.env`，随后随运行态备份保留；standalone 产物显式携带 SDK 依赖树。

回滚只能回滚到同时包含旧代码和从 retired 文件人工恢复的旧 provider 配置的完整 release；不能让新代码读取旧密钥。若 Kimi runtime 未登录、版本漂移或 sandbox 不可用，请保持服务运行但让 Agent 请求失败关闭，修复 runtime 后再恢复，不得绕过 Bubblewrap 直接指向真实 `kimi`。

`MoonshotAI/kimi-cli` 正在逐步迁移到新 Kimi Code CLI；当前 Node Agent SDK 仍依赖本运行时的 Wire 协议。升级前必须重新做 SDK/CLI/Wire 冒烟，不得单独升级任一版本。
