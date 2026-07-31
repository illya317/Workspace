---
name: workspace-operations
description: Operate Workspace delivery and runtime systems. Use for CI, builds, environment configuration, development runtime, deployment, release validation, production diagnostics, or operational scripts; do not use for business features or schema design.
---

# Operations Role

Operations 负责 CI、部署、环境和脚本运行态。

## 角色确认

- 开工前确认根 `AGENTS.md` 的 Role Gate，并确认读取 router 后的第一条角色声明更新已写明 `主角色: Operations` 以及当前环境。
- 在本地、远端开发和生产之间先选定环境；服从宿主入口的端口、容器、凭据和发布限制，不把一个环境的命令套到另一个环境。
- 如果任务主体是业务实现、schema、架构契约、清债或审查，改用对应 `workspace-*` skill。

## 先读

- `docs/engineering/project-overview.md`
- 涉及文档同步时读 `docs/OWNERS.md`
- `docs/engineering/checks.md`
- `docs/engineering/ops/ci-cd.md`
- `.github/workflows/ci.yml`
- 私有部署文档在桌面 ops：`$PRIVATE_OPS_DIR/docs/`

## 职责

- 维护 GitHub Actions CI、CNB CD、部署流程、环境变量检查和运行脚本。
- 维护 Git base/head 影响分类、deploy graph/impact map 依赖闭包、独立 static/Node/type/PostgreSQL/build/E2E job 和稳定的 `CI / required` 聚合门禁；不能确定 owner 时应拒绝分类，不得用风险或规模启发式自动加全量门禁。
- 区分 PR CI 和 deploy/runtime 检查；真实 DB、租户私有配置、ops env 和部署后验证不进入普通 PR CI。
- 调查 CI 失败、构建失败和部署失败。
- 维护 CI、check、runtime、deploy、本地开发命令相关文档，确保命令说明和 `package.json` / workflow 一致。
- 维护 deploy graph 与生成 App 的运行契约：根 `app/`/registry 是事实源，`apps/*` 只通过生成器更新，并由 `deploy:apps:check` 阻断漂移。
- 生产维护遵循提交优先：`prepare` 冻结精确 Git tree；`validate`（CNB）或 `validate --local` 对生产 base 到候选 head 的改动项目及依赖闭包验证一次并冻结目标 artifact；`deploy` 或 `deploy --direct` 只消费同一 base/source/tree/digest。修复后 source/tree 变化，必须重新 prepare/validate。
- 多 agent 共用 main 时，pre-commit 的快照和缓存键只绑定 `HEAD + staged index + 检查环境`；其他 agent 的 unstaged/untracked 写入从一开始就不参与身份计算，不拒绝提交，也不使已通过缓存失效。`prepare` 只读取提交后的 main tree 并快进到干净 release worktree；`deploy` 固定消费该已验证候选。
- 正式门禁不是逐错调试器。第一次 `validate` 失败后必须停止正式全量重跑，展开 classifier 选中的完整检查图，一次性审计源码、私有配置、内存、一次性数据库、TLS、migration/seed/integration、build、浏览器和 artifact 前置；独立检查以聚合模式全部执行，有依赖的链只在前置通过后继续并把其余项报告为 blocked。集中修复完整失败清单、逐项验证后，只允许再跑一次最终 `validate`。禁止“全量门禁 -> 修一个 -> 全量门禁”的循环。本地正式门禁必须确定性生成 injection commit，并把成功检查回执持久化在 release worktree 的 `.cache/release-check-results`；临时 injection worktree 不得拥有或清理这份缓存，只有 source tree、命令、运行时与受治理环境全部一致时才能复用。

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

- Full 与单 unit 的 operator 顺序是 `prepare -> validate -> deploy`。validate 可在 CNB 或本地运行；deploy 可经 CNB 或 `--direct`，但目标（Full/unit 与 shadow/activate）、validation base、source/tree 和 artifact digest 必须完全一致。任何 deploy cache miss 都是阻断，不允许现场构建。Profile/Fleet 仍只经受信发布流水线调用。
- CNB 按 release metadata 构建目标 Linux artifact：Full 为 canonical monolith standalone，单 unit 为 graph/contract 约束的独立制品。已验证 artifact 交给统一部署器按目标执行或复验 control-plane，再完成不可变 release 目录、原子切换、健康检查和失败回滚；服务器不从源码重建生产 artifact。
- Full 成功切流必须生成并原子提交一个无 `activeUnits`、无独立路由的 Gateway generation，让全部公网模块统一回落到本次 monolith；不得保留上一次单 unit/Profile 的公开 override。后续单 unit/Profile 部署再显式建立新的 override。
- `deployed-release.json` 只记录 CNB runtime/canonical source、artifact 与 deployment 证据。候选必须是当前部署 source 的后代；同 source 为 no-op，回退或分叉直接阻断。
- 部署通知必须明确标注范围：Full 显示全量，单 unit/Profile 列出本次实际部署的模块，不得把未变化模块算入。Full 和经 `publish.sh` 发起的单 unit release 展示 Ops 总耗时、release 流程处理耗时、生产部署耗时、尝试次数、可用的 CNB/生产关键阶段和最慢阶段。业务 `main` 处理时间与 CI 执行时间不进入 Ops 统计；release/部署脚本故障后的修复和跨次重试持续累计，直到成功结账。计时会话不得因候选 SHA 或业务路径变化而重置；切回业务处理前显式执行 `ops/publish.sh timing pause`，业务提交完成后由下一次部署自动恢复，或手动执行 `ops/publish.sh timing resume`。Profile promotion 当前只有本次 promotion duration，不能误报为完整跨重试 Ops 计时。
- 当前生产历史会追加 Full、单 unit shadow/activate/rollback 与 Profile promotion 事件到 `.workspace/deployment-history/`，保留逐次 JSON、`latest.json` 与 `deployments.ndjson`。Profile rollback 尚未写通知或部署历史，是必须补齐的审计缺口；执行时应另行保留 operator evidence，不能宣称已由事件链完整覆盖。Operations 不创建定时查询或定时报表；用户要求分析时，由 agent 按需读取历史。

## 验证

远端是否允许合并由 base/head affected `CI / required` 决定。除用户明确要求外不运行 `check:ci` 或其他全量补充门禁。CI 与正式发布的复合检查必须聚合报告同轮全部独立失败；串行依赖项必须显式报告 blocked，不能静默跳过。正式发布按“完整诊断收敛 -> `prepare -> validate -> deploy`”执行；`validate` 是最终验收，不是逐错发现循环，部署阶段只做生产安全检查。Profile/Fleet 只经受信内部入口运行。
