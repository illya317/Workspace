# Agent Runtime: Pi DeepSeek Flash and Kimi

Workspace 的 Agent model loop 由 `AGENT_RUNTIME_PROVIDER=auto|pi-deepseek|kimi` 选择。默认 `auto` 始终先使用下述 Kimi SDK runtime；存在 `PI_DEEPSEEK_API_KEY` 时，仅当 Kimi 在输出文本和调用任何 Workspace 工具之前就失败，才使用 `@earendil-works/pi-agent-core@0.81.1`、`@earendil-works/pi-ai@0.81.1` 和固定模型 `deepseek-v4-flash` 重试。请求取消、runtime 超时、图片 turn、已输出文本或已开始工具调用的 turn 都不回退，避免重复流式内容、proposal 或业务写入。`kimi` 显式模式关闭回退；`pi-deepseek` 显式模式跳过 Kimi，缺少 Key 时失败关闭。旧 `DEEPSEEK_API_KEY` 只作为本地迁移兼容读取，生产应使用 `PI_DEEPSEEK_API_KEY`。

Pi 只接管模型循环和 DeepSeek 协议兼容。Platform 仍负责身份、RBAC、runtime binding、工具实时二次鉴权、proposal/direct-write policy、确认、会话、并发与审计。Pi 不获得 shell、文件系统、MCP、插件或子 Agent 工具；Workspace 工具固定顺序执行，proposal 或澄清产生后停止。DeepSeek V4 Flash 当前是纯文本模型，图片 turn 会返回明确错误。

## Kimi SDK primary runtime

Workspace 页面助手与企业微信内部助手统一使用 `@moonshot-ai/kimi-agent-sdk@0.1.8`，生产 CLI 固定为 `kimi-cli==1.48.0`，Wire 协议固定为 `1.10`。每个 turn 显式选择 Kimi Code 托管模型键 `kimi-code/kimi-for-coding` 并关闭 Thinking；按 Kimi Code 托管路由契约，这条组合固定使用 Kimi K2.6。版本任一不匹配、模型键尚未同步到 CLI 配置或模型不可用时 Kimi runtime 失败；只有满足上述安全边界且配置了 Pi Key 的纯文本 turn 才回退，不会换用 Kimi 的旧 provider 或另一模型。

Workspace 通过 SDK 固定 `thinking: false` 走 Kimi K2.6 非思考路径，并继续使用 CLI 自身的 `max_tokens=32000`。不要把其他直连 HTTP Adapter 的 `reasoning_effort` 或 Token 配置重新引入应用环境。

## 安全边界

- Platform 在启动 SDK 前按 `agentAllowedActions + 请求人 RBAC + 虚拟员工 actor RBAC + active interactive workspace AgentRuntimeBinding 能力清单` 过滤工具；每次 Wire tool call 再实时校验绑定和授权。源码与 CNB PR 工具额外要求双方显式 `agent.source.read/submit`，并标记为 profile-only；本人助手即使获得 source grant 也不能调用。profile 列表只返回当前请求人至少可用一个注册工具的虚拟员工。没有 Workspace 绑定的本地 Codex、CI、服务器虚拟员工不能进入页面助手。虚拟员工账号固定不可登录，不能被当作浏览器会话。
- 每次运行在 `AgentRun` 中保存 runtime binding ID，以及当时职责 instructions、能力清单的不可变 JSON/SHA-256 快照；后续修改运行配置不会改写历史审计证据。
- 自定义 Kimi agent 的 `tools` 和 `subagents` 均为空。CLI 内置 Shell、文件、MCP、插件、后台任务和子 Agent 不进入模型工具集；Wire `PreToolUse` 还会阻断所有非本轮 Workspace allowlist 工具。
- 写工具默认只能生成 proposal；只有工具契约显式声明 `writeMode=direct`，且同时通过 Agent 动作上限、请求人/虚拟员工实时授权和领域 service 校验时，才允许直接写入。当前 QC 官方模板保存/发布使用这条 direct contract，不创建 Agent proposal；保存工具可通过受限 JSON Pointer 结构补丁完整编辑 `document + fieldModel`，但不能修改模板归属、权限、状态、审计或系统元数据。若 Docs Editor 空间把对应业务动作配置成必须走流程，领域 service 仍会拒绝直接执行。其他写工具继续使用 proposal：SDK 不注册 proposal confirm executor；请求人确认由独立 Workspace API 固定原 profile/actor、原子抢占状态并重新鉴权后执行。抢占记录带执行 token 与租约；进程中断后的陈旧执行只能落为“结果未知、需人工核对”，不得自动重放。源码 PR proposal 还固定完整 patch、SHA-256、远端仓库、base commit/branch 和确定性 proposal branch，执行前再次验证目标与实际暂存文件集。确定性分支使用 create-only push；校验、缺 token、clone/apply 等 dispatch 前失败保持“结果已知”，只有首次 push dispatch 后的异常才标记远端结果未知并要求人工 reconciliation。
- SDK 会继承父进程环境，因此生产 executable 必须是 `kimi-agent-sandbox-runner.sh`。runner 的 shebang 在 Bash 启动前清空环境，再通过 Bubblewrap 二次 `--clearenv`，只挂载专用 runtime、空 workdir、Kimi 凭据目录和经过校验的本轮只读 agent config；应用 `.env`、数据库、源码和服务器 home 不可见。
- Web 和企业微信共用 3 个活跃 turn 槽位；这是 Workspace 自身的硬上限，不因选择 OAuth 或 API Key 而放宽。

## 流式传输

- `/api/agent` 与 `/api/integrations/wecom/agent` 都返回 `application/x-ndjson`，事件固定为 `status / delta / heartbeat / result`。调用方必须持续读取到唯一的 `result`，不能再按单个 JSON body 解析。
- Platform 每 15 秒发送 heartbeat，响应带 `Cache-Control: no-cache, no-transform` 和 `X-Accel-Buffering: no`。这条 heartbeat 独立于模型文本输出，因为连续工具调用可能长时间没有 `ContentPart`。
- 网页 fetch 取消或企业微信 worker 超时必须向下游 AbortSignal 传播；Kimi turn 上限仍为 15 分钟，企业微信 bridge 客户端上限为 16 分钟，只为最后清理保留余量。
- 企业微信 worker 部署产物必须同时包含 `wecom-agent-bot.mjs`、`wecom-agent-delivery.mjs`、`wecom-agent-input.mjs` 与 `wecom-agent-stream.mjs`。

## 安装与认证

Agent 会话消息、摘要和图片默认保存在 `$WORKSPACE_CONFIG_DIR/agent`。如需通过 `AGENT_DATA_DIR` 覆盖，必须使用绝对路径；服务端不接受相对路径，也不会把运行态存储回退到源码 checkout。Agent 源码阅读使用部署时独立同步的绝对 `AGENT_SOURCE_WORKTREE`，或绝对 `AGENT_SOURCE_CACHE_DIR`；这些动态源文件路径显式排除于 Turbopack tracing，不能把 Git 历史和源码打入 standalone 部署产物。远端 clone/fetch 可以使用运维配置的 credential-bearing URL，但 snapshot、模型工具数据和 Git 失败消息只允许返回去凭据后的 canonical repository identity。

生产 Ubuntu/Debian 服务器执行：

```bash
export WORKSPACE_CONFIG_DIR=/home/ubuntu/workspace/.workspace
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --login
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh --check
```

在完整源码 checkout 中也可使用等价的 `npm run agent:runtime:install|login|check`。首次生产部署会先同步 bootstrap 脚本和安装 runtime；模型认证是唯一需要人工完成的激活步骤。

本地 macOS 开发使用同一组 npm 命令。安装脚本会创建独立 venv，并用系统 `/usr/bin/sandbox-exec` 安装 Darwin runner；它清空应用环境，只允许读取固定 CLI、runtime 配置和本轮 Agent 配置，写入限制在 runtime 的 `home/share/work/tmp`。生产 Ubuntu/Debian 仍固定使用 Bubblewrap + AppArmor，不会回退到 Darwin runner。

`--login` 使用固定 CLI 的官方配置向导，可选择：

- `Kimi Code`：浏览器 OAuth，使用 Coding Plan 订阅；
- `Moonshot AI Open Platform (moonshot.ai)`：输入 API Key，使用 `https://api.moonshot.ai/v1` 与 API 账户计费，不需要 OAuth。

官方登录配置会从 `/models` 获取托管模型；启用 Agent 流量前必须确认配置中已有 `kimi-code/kimi-for-coding`。CLI 会在启动时后台刷新托管模型列表，但 Workspace 不会因此临时回退到登录时选择的旧默认模型。

API Key 只在服务器终端的官方向导中输入，不写入 Workspace `.env`，也不要通过聊天、命令参数或日志传递。向导配置与 OAuth 凭据都只保存在：

```text
$WORKSPACE_CONFIG_DIR/runtime/kimi-agent/share
```

不要把该目录复制到构建产物、日志、`.env` 或个人 home。目录和新建凭据使用仅 owner 可访问的权限；部署会保留该运行态目录，只更新固定 CLI 和 sandbox runner。

`--check` 会让固定 CLI 的 `--version` 真正经过 Bubblewrap 执行，因此会同时阻断版本错误、缺少 user namespace 或 sandbox 挂载失败；它还会沿 `default_model -> model -> provider` 校验当前认证，只接受 Kimi 官方 Coding/API endpoint，并仅输出 provider 和 credential 类型，不输出密钥。

Ubuntu 24.04 默认用 AppArmor 限制未授权进程创建 user namespace。安装脚本不会全局关闭该保护；它把系统 `bwrap` 复制为 root 持有的 Workspace 专用 executable，并只为这个固定路径加载带 `userns` 权限的 AppArmor profile。runner 不调用通用 `/usr/bin/bwrap`，避免把例外扩散到服务器上的其他进程。

## 部署与回滚

`ops/deploy.sh` 默认保留并校验 Kimi primary runtime，同时从服务器 `.env` 删除已废弃的 `AGENT_MODEL_PROVIDER`、`KIMI_*` API 直连项和旧 `DEEPSEEK_*`。Pi DeepSeek fallback 使用独立的 `PI_DEEPSEEK_API_KEY`，不会被旧配置清理逻辑删除；Kimi API Key 仍由专用 CLI 配置持有，不放回应用环境。首次迁移会先把旧值移到不加载、权限为 `0600` 的 `$WORKSPACE_CONFIG_DIR/retired/agent-provider.env`，随后随运行态备份保留；standalone 产物显式携带两个 runtime 的依赖树。

回滚只能回滚到同时包含旧代码和从 retired 文件人工恢复的旧 provider 配置的完整 release；不能让新代码读取旧密钥。若 Kimi runtime 未登录、版本漂移或 sandbox 不可用，且已配置 `PI_DEEPSEEK_API_KEY`，新的纯文本 turn 会在上述安全边界内回退到 Pi；未配置 fallback、图片 turn 或已经开始输出/执行的 turn 仍失败关闭。不得绕过 Bubblewrap 直接指向真实 `kimi`。

`MoonshotAI/kimi-cli` 正在逐步迁移到新 Kimi Code CLI；当前 Node Agent SDK 仍依赖本运行时的 Wire 协议。升级前必须重新做 SDK/CLI/Wire 冒烟，不得单独升级任一版本。
