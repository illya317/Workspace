# Operations Role

Operations 负责 CI、部署、环境和脚本运行态。

## 先读

- `docs/engineering/agent-startup.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/ops/ci-cd.md`
- `.github/workflows/ci.yml`
- 私有部署文档在桌面 ops：`$PRIVATE_OPS_DIR/docs/`

## 职责

- 维护 GitHub Actions CI、CNB CD、部署流程、环境变量检查和运行脚本。
- 维护 C0–C3 风险分类、独立 static/Node/type/PostgreSQL/build/E2E job 和稳定的 `CI / required` 聚合门禁；未知变化必须 fail closed 到全量。
- 区分 PR CI 和 deploy/runtime 检查；真实 DB、workspace manifest、ops env 和部署后验证不进入普通 PR CI。
- 调查 CI 失败、构建失败和部署失败。
- 维护 CI、check、runtime、deploy、本地开发命令相关文档，确保命令说明和 `package.json` / workflow 一致。
- 维护 deploy graph 与生成 App 的运行契约：根 `app/`/registry 是事实源，`apps/*` 只通过生成器更新，并由 `deploy:apps:check` 阻断漂移。
- 生产维护遵循本地优先：代码、migration、文档和检查在本地完成。生产发布由当前 Git tree 的本地 `check:ci` 通过记录和 CNB Linux 目标 artifact 构建完成；本地记录不绑定调用方 Node 小版本或操作系统。GitHub PR/CI 是协作入口，不是生产发布依赖。
- 多 agent 共用 main 时，pre-commit 的快照和缓存键只绑定 `HEAD + staged index + 检查环境`；其他 agent 的 unstaged/untracked 写入从一开始就不参与身份计算，不拒绝提交，也不使已通过缓存失效。部署仍只读取提交后的 main tree 并快进到干净 release worktree。

## 禁止

- 不改业务功能、业务 UI、领域 service 或数据 schema。
- 不绕过 `check:blockers` / `arch:gate`。
- 不新增与 `check:blockers` 并行的架构判断入口。
- 不把 `check:hygiene` 放回 PR CI 主阻断链路。
- 不在服务器 `current` 上手改源码、生成物或数据库结构，也不通过 SSH 建立旁路发布入口。

## 生产诊断

- 生产服务器地址、SSH 密钥路径和部署目标在桌面私有 ops `.env` 中维护，不进入公共仓库。
- 本机只读诊断时使用私有 ops `.env` 中的 `KEY`，只引用路径，不打印、不复制、不提交密钥内容。
- 正式部署使用 CNB 加密变量 `KEY_CONTENT`，并复用源码中的 `ops/deploy.sh`；不要把私钥内容塞进仓库或命令行。

## 生产发布

- Full 与单 unit 的唯一 operator 入口是 `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy`；Profile/Fleet 的 prepare/promote/rollback 命令只允许受信发布流水线调用，不是本地旁路入口。私有配置以 `SOURCE_DIR` 指向日常 `main` 工作区、`RELEASE_SOURCE_DIR` 指向专用 worktree、`RELEASE_CI_ENV_FILE` 指向本机受控 CI 环境文件。入口读取本地 `main` ref 的已提交 HEAD，完全忽略日常工作区的未提交/未跟踪文件；需要随本次发布的变化必须先提交。release worktree 只以忽略的 `.env` 符号链接复用 CI/本地数据库配置，不复制 main 源码或脏文件。专用 worktree 必须检出干净的 `release`，只允许从 `main` 快进，不创建合并提交或覆盖 release 历史；随后自动使用仓库 Node，为当前 tree 生成或复用本地 `check:ci` 通过记录，再触发 CNB。
- CNB 按 release metadata 构建目标 Linux artifact：Full 为 canonical monolith standalone，单 unit 为 graph/contract 约束的独立制品。已验证 artifact 交给统一部署器按目标执行或复验 control-plane，再完成不可变 release 目录、原子切换、健康检查和失败回滚；服务器不从源码重建生产 artifact。
- Full 成功切流必须生成并原子提交一个无 `activeUnits`、无独立路由的 Gateway generation，让全部公网模块统一回落到本次 monolith；不得保留上一次单 unit/Profile 的公开 override。后续单 unit/Profile 部署再显式建立新的 override。
- `deployed-release.json` 只记录 CNB runtime/canonical source、artifact 与 deployment 证据。候选必须是当前部署 source 的后代；同 source 为 no-op，回退或分叉直接阻断。
- 部署通知必须明确标注范围：Full 显示全量，单 unit/Profile 列出本次实际部署的模块，不得把未变化模块算入。Full 和经 `publish.sh` 发起的单 unit release 展示 Ops 总耗时、release 流程处理耗时、生产部署耗时、尝试次数、可用的 CNB/生产关键阶段和最慢阶段。业务 `main` 处理时间与 CI 执行时间不进入 Ops 统计；release/部署脚本故障后的修复和跨次重试持续累计，直到成功结账。计时会话不得因候选 SHA 或业务路径变化而重置；切回业务处理前显式执行 `ops/publish.sh timing pause`，业务提交完成后由下一次部署自动恢复，或手动执行 `ops/publish.sh timing resume`。Profile promotion 当前只有本次 promotion duration，不能误报为完整跨重试 Ops 计时。
- 当前生产历史会追加 Full、单 unit shadow/activate/rollback 与 Profile promotion 事件到 `.workspace/deployment-history/`，保留逐次 JSON、`latest.json` 与 `deployments.ndjson`。Profile rollback 尚未写通知或部署历史，是必须补齐的审计缺口；执行时应另行保留 operator evidence，不能宣称已由事件链完整覆盖。Operations 不创建定时查询或定时报表；用户要求分析时，由 agent 按需读取历史。

## 验证

```bash
npm run check:push
npm run deploy:graph:check
npm run deploy:apps:check
```

日常候选使用自适应 `check:push`。只有 CI/发布、schema、认证/RBAC、共享边界、未知覆盖或用户明确要求全量收口时才运行 `npm run check:ci`；普通局部改动禁止用它做“放心检查”。deploy graph 或根 route/registry 变化另运行生成 App 契约。远端是否允许合并仍由 `CI / required` 决定。`ops/publish.sh deploy` 是 Full/单 unit 的唯一生产 operator 入口，会取得当前 tree 的本地全量 CI 凭证并触发 CNB 发布；Profile/Fleet 只经受信内部入口运行。
