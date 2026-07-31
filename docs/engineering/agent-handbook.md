# 工程系统手册

这份文档汇总跨专题工程事实，供维护者阅读，也供 coding agent 按需引用。Agent 的开工入口和角色流程分别以 `AGENTS.md`、`.agents/skills/workspace-role-router` 和对应 role skill 为准；不要在这里维护第二套路由。

## 1. 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + PostgreSQL 15+（PrismaPg adapter）
- **认证**: JWT Cookie + Open API Bearer Client
- **CI/CD**: GitHub Actions 负责 PR/合并质量；生产 Release Plan 封存 standard/fast 模式、目标和 local/CNB 执行器，源码验证与构建各至多一次，部署只消费 canonical artifact

## 2. 部署与运行态同步

`origin`（GitHub）继续承载协作、PR 和公开 CI；生产部署真源是本地已提交 source SHA/tree 生成的 CNB `cnb-release` request。历史 `codeup` 远端已废弃，不再配置或同步。

- 普通候选不直接 push `main`。Git 跟踪的 `ops/publish.sh push` 先跑自适应本地 gate，再更新稳定 staging ref；受信任的 GitHub workflow 创建或更新同一个 bot-authored candidate PR，并在精确 SHA 上触发 CI。桌面 ops 的同名脚本只是加载私有 `.env` 后转交此脚本。
- 不把 `cnb/main` 当发布源码入口。正式发布时，底层脚本在当前已提交 source 的 child commit 中只注入由 `WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml` 产生的 `.cnb.yml` 与发布元数据，然后触发 `cnb-release` 的 `api_trigger_manual`；仓库内 `ops/cnb-release.yml` 只保留通用形状。
- 生产维护尽量在本地完成代码、migration、文档和检查。`publish.sh deploy` 是唯一生产发布入口；不要在服务器 `current` 上手改源码、生成物或数据库结构，也不要通过 SSH 建立旁路发布入口。
- 生产发布必须先 commit 且工作区干净；GitHub PR/CI 可以继续用于协作质量，但 `deploy` 不调用 GitHub API、Actions、Release 或 GitHub token。
- `publish.sh prepare` 创建不可变 Plan；`validate` 只做一次源码门禁，`build` 只做一次 artifact 构建，`deploy` 只消费相同 base/source/tree 的 artifact。阶段终态不重开，失败后用 `prepare --new-plan`；所有阶段默认 local，可在 prepare 时封存单向 CNB 分界。
- 服务器运行态只来自 `REMOTE_WORKSPACE_CONFIG_DIR`，包括 `.env`、文档/资料/QC 文件、`public/company`、`public/assets/agent/avatar/` 等，不随构建产物覆盖；每次部署会先做 PostgreSQL `pg_dump` 并备份该目录。
- `data/` 中的文件型运行态以服务器为准：本地 `data/` 不上传覆盖服务器；业务关系数据只存 PostgreSQL。
- 项目根不要创建 `data -> 外部目录` 软链；Next/Turbopack 构建会追踪项目根 data 软链并可能因指向项目外而失败。代码通过 `.env` 中的 `DATABASE_URL` / `DIRECT_URL` 连接 PostgreSQL，通过 `WORKSPACE_CONFIG_DIR` 定位文件型运行态。
- `.env` 可以软链到外部 `.workspace/.env`；`public/company` 和 `public/assets/agent/avatar` 开发时可软链到 `.workspace/assets/...`，生产 standalone 打包时脚本用 `cp -rL` 复制真实文件。
- 页面助手不挂载或读取源码、Git worktree、数据库、`.env` 或服务器 home。其运行态是 API-only 薄壳，只能使用 Platform 注入的三个受保护业务 API connector；源码同步、检查、提交和部署留在外部 Codex/CI/服务器流程。

候选提交流程：

```bash
git status --short
git add <files>
git commit -m "<message>"
OPS_ENV_FILE=$PRIVATE_OPS_DIR/.env ops/publish.sh push
```

生产发布流程：

1. 确认当前 HEAD 是要发布的已提交版本、分支为 `main` 且工作区干净，创建 Plan。默认 standard 且全 local；紧急发布用 `--fast "原因"`，从某阶段进入 CNB 用 `--cnb-from validate|build`：

```bash
OPS_ENV_FILE=$PRIVATE_OPS_DIR/.env ops/publish.sh prepare
OPS_ENV_FILE=$PRIVATE_OPS_DIR/.env ops/publish.sh validate
OPS_ENV_FILE=$PRIVATE_OPS_DIR/.env ops/publish.sh build
OPS_ENV_FILE=$PRIVATE_OPS_DIR/.env ops/publish.sh deploy
```

2. standard Plan 的 `validate` 以生产 deployed source 为 base，只校验候选 head 的受影响 owner 与依赖消费者；fast Plan 把该阶段记录为 `skipped_by_fast`。`build` 独立构建并缓存不可变 artifact。
3. `publish.sh deploy` 只复用 Plan 的 source validation 状态和 artifact，不运行源码门禁或构建。成功后复验 schema-v3 `deployed-release.json` 的 runtime/canonical source、CNB/artifact、PM2、health 与版本。
4. 成功、fast skip、失败和取消都是不可重开的终态。失败后集中诊断和修复，再显式 `prepare --new-plan`；不要在原 Plan 内反复运行全量 CI/build。

`--cnb-from deploy` 是未来 artifact capsule handoff 的保留分支；当前显式拒绝，绝不通过在 CNB 重建来伪装 deploy-only handoff。

生产服务器地址、SSH 密钥路径和 `CNB_REPO` 在桌面私有 ops `.env` 中维护。本机只读诊断时使用私有 ops `.env` 中的 `KEY`，只引用路径，不打印、不复制、不提交密钥内容。部署流水线使用 CNB 加密变量 `KEY_CONTENT`，不要改成本地私钥直传。

风险分级、artifact 命名、migration maintenance 和分支保护状态以 [`ops/ci-cd.md`](ops/ci-cd.md) 为准。新环境构造、`.workspace` 目录恢复、服务器 data 拉取规则见 `$PRIVATE_OPS_DIR/AGENTS.md`；私有部署细节见 `$PRIVATE_OPS_DIR/docs/deploy.md` 和 `$PRIVATE_OPS_DIR/docs/environment.md`。

## 3. 项目地图

本项目不是单一 HR 应用，而是会继续扩展 HR、财务、库存、合同、绩效、采购、生产等模块的内部管理系统。新增能力时先判断它属于哪一层：

当前改造方向是“三层多包”，这是后续 agent 写代码的默认前提：

- **Core 底座**：只放通用 UI、字段输入、筛选、表格、确认弹窗、日期、FK 搜索、tag 输入、路由 helper 等纯通用能力；不能依赖 Prisma、权限和业务事实。
- **Platform 主体**：放登录、权限、资源树、模块注册、导航、审计、用户账号、Portal 和平台页面壳；可以聚合模块注册，但不写 HR/生产/财务的业务规则。
- **Apps 业务包**：HR、Production、Finance、Work 等各自拥有自己的 `ui/server/types/constants/import`，业务查询、校验、导入、DTO 和页面组件都要逐步下沉到对应包。

`app/` 和 `app/api/` 只承担 Next 路由壳。新增和重构时不能继续按旧思路把业务逻辑堆在 route；必须顺着包边界迁移。

| 层级 | 目录 | 职责 |
|---|---|---|
| Core 底座 | `packages/core/` | 通用 UI、hooks、字段、弹窗、日期、FK 搜索、tag 输入、routing/search helper |
| Platform 主体 | `packages/platform/` | 登录、权限、资源树、模块注册、导航、审计、用户、Portal、平台 server runtime 契约 |
| Apps 业务包 | `packages/hr/`, `packages/production/`, `packages/finance/`, `packages/<domain>/` | 各业务模块自己的 UI、server、types、constants、import、module 注册 |
| 业务页面壳 | `app/(modules)/<domain>/` | Next 路由 facade，只组合 package UI，保留领域 `ARCHITECTURE.md` |
| API 路由壳 | `app/api/modules/<domain>/<l2-kebab>/` | 鉴权、权限、Zod 参数校验、调用 package service、返回 DTO |
| 远端开发 | `docs/engineering/ops/remote-development.md` | 先确认 Codex 实际工作目录；服务器项目走 SSH/Remote SSH，不提供免认证登录 bypass |
| 旧业务服务 | `server/services/<domain>/` | 存量兼容/待迁移旧代码；新增业务 service 不再优先放这里 |
| 认证权限 | `@workspace/platform/server/auth`, `@workspace/platform/permissions`, `packages/platform/server/auth/`, `packages/platform/server/rbac/` | 登录、session、RBAC、资源树；新代码使用 Platform 契约 |
| 数据库 | `prisma/` | Prisma schema、migration、seed |
| 文档治理 | `docs/`, `app/*/ARCHITECTURE.md` | 项目地图和模块边界 |

新增业务模块必须先建立 package 边界。例如绩效模块应使用 `packages/performance/{module,ui,server,types,constants,import}` 承载实现，再由 `app/(modules)/performance/<l2>/` 和 `app/api/modules/performance/<l2>/` 提供薄路由壳。禁止把新模块塞进 HR、Finance 或 route 文件里借壳生长。

### 页面助手模型上下文与图片

- 页面和企业微信入口统一进入 Platform 的共享 Agent runtime：Kimi Agent SDK 始终为默认主 runtime；仅当它在输出文本或调用 Workspace 工具前不可用时，配置了 `PI_DEEPSEEK_API_KEY` 的环境才安全回退到 Pi DeepSeek V4 Flash。会话仍由 Workspace 持久化和压缩，Kimi CLI 只看到专用空工作目录，结束后删除临时 Wire session。
- 两个入口统一消费 `application/x-ndjson` 响应流：`status / delta / heartbeat / result` 是固定事件，heartbeat 每 15 秒产生一次，避免工具调用阶段因没有文本 token 而被反向代理按空闲请求中断。网页原位更新当前消息；企业微信使用同一个 stream id 节流刷新，结束时才发送 `finish=true`。
- Web 与企业微信共用一个进程级活跃 turn 限流器，硬上限为 3。排队请求不计入活跃数；完成、异常和取消都必须在 `finally` 中释放槽位。OAuth 与 API Key 认证共用同一上限。
- Kimi 自定义 agent 的内置工具列表固定为空；只有经过 `agentAllowedActions` 与当前 `SessionUser` RBAC 过滤的 Workspace 工具才能通过 Wire 注册，工具真正调用前再次授权。写工具必须只返回 proposal，确认仍走独立 API 并重新鉴权。
- 需要用户补充必填项或消除歧义时，SDK `QuestionRequest` 必须转成 `clarification` 返回并写入 Workspace 会话；同一轮一旦出现待澄清问题，mutating tool 必须停止。下一轮由正常会话历史承接用户反馈，不得用占位回答替用户选择实体或引用 ID。
- proposal 的字段差异和可观测状态必须进入模型历史：初始消息记录 `pending`，`confirmed / cancelled / failed / expired` 终态按 `sessionId` 追加到会话。错误恢复不得把可能已过时的 `pending / executing` 追加在终态之后；数据库状态和按 owner 读取的 proposal API 始终权威。会话落盘失败不能改变数据库中的 proposal 终态，也不能遮蔽 executor 原错误。
- 业务写入工具按 `精确读取当前表单 -> 复用业务 FK registry 搜索候选 -> 生成 proposal -> 用户确认 -> 重新鉴权与校验 -> 调用原业务 command/service` 建立深接口。Agent schema 只能暴露人工表单在该状态下真实可编辑的字段，不能复制一份更宽的 CRUD payload；条件隐藏字段、锁定字段、版本字段和业务派生默认值必须在服务端拒绝或由同一领域入口推导。
- SDK 子进程必须经过 `ops/kimi-agent-sandbox-runner.sh`：在 Bash 启动前清空继承环境，只挂载专用 Kimi home/share、空 workdir、固定 agent config 和只读 Python runtime。禁止给 CLI 挂载应用源码、数据库、`.env`、服务器 home、任意 MCP 或 Shell/文件工具。
- 页面和企业微信入口都把已认证 `SessionUser` 的 Workspace userId、登录名、员工姓名/工号和企业微信 userId 作为只读身份上下文；“我是谁/我的工号”直接使用该绑定回答，不调用人员搜索，也不把身份绑定解释成额外权限。
- HR 人员查询必须提供姓名、工号或别名关键词，禁止空关键词返回全员名单；候选按精确值、前缀和包含关系排序，最多给模型 20 人。经 `hr.roster.read` 校验后的姓名和工号必须原样显示，不得用星号脱敏，其他非必要个人字段不进入模型投影。
- 图片原文件作为不可变 session asset 保存，附件展示和下载继续使用原始文件名、类型与字节数；禁止用模型压缩副本覆盖原图。
- 企业微信 `image` / `mixed` 由长连接 worker 在五分钟有效期内下载并用消息 `aeskey` 解密，随后进入与网页一致的 4 张、单张 5MiB 图片校验链路；不得把临时下载 URL 直接交给模型。模型返回的资料库 JPG/PNG 原件可作为最终流的 `msg_item` 图文发送，其他图片走企业微信 image media，普通资料仍走 file media。
- 发送模型前由 `packages/agent/server/model-image.ts` 生成衍生图：输入最大 2500 万像素、单图最长边 2000px，多图共享 800 万像素和 1MiB 原始字节预算，单图最多 512KiB。图片数量为 4 时每张预算为 256KiB、最长边上限约 1414px。
- 截图、表格和透明图片优先保留 PNG；超过预算后使用抗锯齿缩放和 JPEG 80/60/40/20 质量阶梯，文字类图片使用 4:4:4 色度采样。处理时自动应用 EXIF 方向、转 sRGB、禁止放大，并通过重新编码剥离非必要元数据。
- GIF/动画 WebP 只有在原始尺寸和字节预算内才直传；超限时明确拒绝并要求转为静态图片，不得静默丢帧。模型副本生成失败时也不得回退发送超限原图。

Pi DeepSeek Flash、Kimi SDK/CLI 的固定版本、模型认证和生产校验见 `docs/engineering/ops/kimi-agent-runtime.md`。

### Agent 接力和文件隔离

开工角色由 `.agents/skills/workspace-role-router/SKILL.md` 选择，具体边界由对应 `workspace-*` skill 定义。Coordinator 负责规划、拆包、分配、跟进、集成和收口自检；最终 Review 必须保持独立，不审自己刚实现或刚集成的改动。

并行时只 stage 自己的文件。`git status --short` 中出现其他 agent 的范围时，不要提交、回滚、格式化或改名。确实需要干净工作区验证时，先 stage 自己的文件，再用 `git stash push --keep-index --include-untracked` 临时隔离，验证后恢复 stash。

## 4. 必读文档触发条件

`AGENTS.md` 保留 Role Gate，角色 skill 保留任务触发，完整治理规则见 `docs/engineering/architecture-governance.md`。

如果任务同时命中多个条件，全部相关文档都要读。读完后在交付说明里写明参考了哪些文档，以及是否同步更新了文档。

涉及下拉、搜索、筛选、日期、确认弹窗、tag 输入、表格、页面模板时，还必须先读 `docs/engineering/reusable-components.md`。已有 Core/Platform/App 组件能覆盖的场景，不允许在页面或业务包里重复造控件。

## 5. 新模块接入流程

仅适用于“新增业务模块 / 新 domain”。如果是在已有模块内新增 Tab、审核流、规则页、CRUD 能力，改看 `docs/engineering/existing-module-feature-checklist.md`。

1. 在 `packages/platform/module-registry.ts` 注册 L1/L2：`moduleDef`、`children`、`href`、`resourceKey`、规范 API URL 或 `noApiReason` 必须一次写齐；业务 API 统一使用 `/api/modules/<module>/<resource path>` 并由 URL 推导 resourceKey，不要写在 `apiGuards/apiRoutes` 里。旧兼容路径只能留在 `apiPrefixes`，并且对应 contract 必须写 `migrationNote`。
2. L1/L2 RBAC resource 由 module registry 自动派生；不要在业务包里重复手写主资源，也不要在 seed 里维护第二套资源树。需要 RBAC 常量时使用 `@workspace/platform/permissions`。
3. `packages/<domain>/module.ts` 必须导出 registry 中的 `moduleDefinition`，不要在业务包本地重新定义模块。
4. 模块展示名、描述、隐藏和启停优先改 `packages/platform/module-overrides.ts`；不要为了中文 rename 改 `resourceKey`、FK key、API path 或 URL path。
5. `parentKey` 只表达 RBAC 权限继承；不能继承父权限、但必须随模块启停的 capability 使用 `runtimeParentKey`，例如 `settings.api.manage`。
6. 创建模块或 L2 的 `ARCHITECTURE.md`，写清楚数据来源、事实字段、计算字段、权限、页面和 API 边界。
7. 如需新表，创建 `prisma/models/<domain>.prisma`，同步 migration/seed，并更新数据库文档。
8. 在 `packages/<domain>/server/` 写业务逻辑；`server/services/<domain>/` 只用于尚未迁移的存量代码。API route 只做认证、权限、Zod 参数校验、调用 service、返回 DTO；写入请求按 `Zod schema -> domain validator -> service/Prisma` 落位。
9. 在 `app/api/modules/<domain>/<l2-kebab>/` 写 route handler，GET/POST/PUT/PATCH/DELETE 必须匹配 registry 中同一个 L2 的 URL-derived resource/action。系统设置例外走 `/api/settings/<l2>`，认证和 Agent 是独立 L1。
10. 在 `packages/<domain>/ui/` 写主要 UI；`app/(modules)/<domain>/` 只放 Next route facade。模块首页用 Platform 的 `ModuleHomePage`，L2 子页面用 Platform 的 `AppShell`。
11. 对需要独立权限的子页面，在对应子目录加 `layout.tsx`，调用 `requireRouteAccess("<href>")` 做路由门禁；不要在页面手写 resource key。
12. 删除 L1/L2 时同步删除 registry、真实 app route、API route、docs 和相关引用；`scripts/seed-resources.ts` 会清理 DB 中未注册的 stale resources 及其授权，不要留下 hidden/disabled 旧 resource 当兼容层，除非任务明确要求。
13. 同步更新 `README.md`、`AGENTS.md` 或 docs、`docs/engineering/new-module-checklist.md` 和对应模块文档。
14. 交付前运行硬约束，并提交一个清晰 commit。

摘要：

| 步骤 | 内容 |
|------|------|
| 1. L1/L2 注册 | `packages/platform/module-registry.ts` 注册页面、resourceKey、apiPrefixes；主 RBAC resource 和 API owner resource 自动派生 |
| 2. 导航 | `packages/<domain>/module.ts` 导出 registry 中的 `moduleDefinition`，不要维护第二套导航 |
| 3. 数据库 | `prisma/models/<domain>.prisma` + migration + seed |
| 4. 页面 | facade server component + 子目录 `layout.tsx` 路由门禁 |
| 5. API | module registry/API contract -> `createApiRouteHandler` 或已接入 `requireApiAccess` 的 wrapper -> Zod 参数校验 -> 调 package service/action -> 返回 DTO；写入继续进 domain validator 和 service |
| 6. Service | `packages/<domain>/server/` 业务逻辑 |
| 7. 文档 | `ARCHITECTURE.md` + README/AGENTS/docs/checklist |
| 8. 硬约束 | `tsc --noEmit` / `lint --max-warnings=0`（含文件行数红线） / `build` / `arch:gate` |

## 6. 数据库模型

核心业务表：

| 表 | JSON 来源 | 说明 |
|---|---|---|
| `Employee` | `employees.json` | 员工基础信息，16 字段 |
| `Employment` | `employments.json` | 雇佣信息，status/company/joinDate/leaveDate/contracts 等 |
| `EDP` | `employee_positions.json` | 员工-部门-岗位关联，`@@map("EmployeePosition")` |
| `Department` | `department.json` | 部门树，扁平存储，parentId 推导自 children |
| `Position` | `position.json` | 岗位 |
| `PositionDescription` | `position-descriptions/*.json` | 岗位说明书，details 为 JSON blob |
| `Company` | `companies.json` | 公司 |

已删除的表/字段：ManagementGroup 整张表、Employee.deleted/deletedTime/deletedBy、EDP.system/center/sortOrder、Department.sortOrder 等。

审计字段统一顺序为 `editedBy -> editor -> editedAt -> version -> createdAt -> updatedAt`。Employee、Employment、Company、Department、Position、EDP、Project、EmployeeProject、PositionDescription、Report 均具备。

Schema 可视化文档：`docs/generated/tables.html`，通过 `node scripts/gen-tables-html.js` 生成。

## 7. Prisma Schema 规则

- 当前 schema 已按领域拆分到 `prisma/models/*.prisma`，主 `prisma/schema.prisma` 只保留 `generator` 和 PostgreSQL `datasource`。
- 所有 model 必须按领域归属：auth/rbac、hr、reports、works、finance-ledger、finance-cost、inventory、contracts、future domains。
- 每个 model 前必须有 `///` 注释，说明业务含义、数据来源、是否事实表。
- DB 默认只保存事实字段；合计、百分比、毛利、单位成本、未回款等派生结果必须放在 service 层计算。
- Finance Cost 禁止把 normalized JSON 原样映射成 DB schema。
- 修改 schema 后必须同步更新对应 `ARCHITECTURE.md` 和 `docs/engineering/database.md` 或 `docs/engineering/schema-governance.md`。

## 8. 数据导入

源数据在 `prisma/seed-data/*.json`、`prisma/seed-data/position-descriptions/*.json` 和 `prisma/seed-data/department-descriptions/*.json`。

导入顺序：

```txt
Company -> Department -> PositionDescription -> Position -> Employee -> Employment -> EDP
```

重建空的本地数据库（只用于可丢弃的开发库）：

```bash
dropdb workspace_dev
createdb workspace_dev
npx prisma migrate deploy --schema=./prisma
```

禁止在共享或生产库执行 `prisma db push`。SQLite 到 PostgreSQL 只通过冻结快照、`scripts/migrate/sqlite-to-postgresql.mjs` 和校验 manifest 迁移。

## 9. 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 工作空间 | `/work` | `work.tasks.entry` |
| 人事行政 | `/hr` | `hr.entry` |
| 管理后台 | `/settings/admin` | `requireAdminManageAccess()` |
| 账号与接入 | `/settings/account` | `settings.account.entry` |
| 个人 API 使用 | `/settings/account` | `settings.account.apiAccess.entry`（业务 API 仍按目标 resource 授权） |
| 设置 | `/settings` | 登录 |
| 智能助手 | `/api/agent` | 登录，权限随用户 |
| 外部关系 | `/external` | `external.entry` |
| 文档中心 | `/docs` | `docs.entry` |
| 资料库 | `/library` | `library.entry` |
| 财务数据 | `/finance` | `finance.entry` |
| 成本管理 | `/finance/cost` | `finance.entry` 或 `finance.cost.entry` |

## 10. 认证与 API 权限

认证方式：

1. 网页版：Cookie JWT (`token`)
2. 内部 API：`/api/modules/**` 使用 Cookie 会话 + RBAC `authorize()` 或平台 wrapper。
3. 外部 Open API：`/api/open/v1/**` 使用 `Authorization: Bearer <OpenApiClient secret>` + `OpenApiScope` grant，不读取内部 RBAC `Resource`。
4. 权限校验：优先使用 `@workspace/platform/server/auth` 中的平台契约；旧 `lib/auth.ts` 聚合 hub 已删除，不要恢复同类兼容入口。

API 权限规则：

- 页面按钮隐藏不是安全边界，所有写入和删除必须在 API 层校验。
- 当前运行时默认映射：GET 使用 `read`；POST 使用 `create`；PUT/PATCH 使用 `update`；DELETE 使用 `delete`。语义不符合默认值，或同一 API 前缀下需要区分对象/空间 scope 的接口，必须在 `packages/platform/permission-api-action-policy.ts` 用 `pathPattern + requiredActions + scopeExtractor` 显式注册，例如导入用 `import`、审批用 `approve`、配置用 `configure`、授权管理用 `grant`。
- 新 API route 只允许做四件事：认证、Zod 参数校验、调用 service、返回 DTO；写入必须继续进入 domain validator 和 service。
- 复杂查询、导入、汇总、派生字段计算必须放到 `packages/<domain>/server/`；旧 `server/services/<domain>/` 只作为存量兼容位置。
- 旧兼容 API 可以保留代理，但新功能必须走领域入口，例如 HR 新接口走 `app/api/modules/hr/roster/*`，财务成本走 `app/api/modules/finance/cost/*`。
- 需要对外开放的新接口必须走 `packages/platform/open-api-registry.ts` 注册，并放在 `/api/open/v1/**`，不得直接暴露内部 `/api/modules/**`。

## 11. 业务规则

### 公司分组

- 公司事实来源：公司名称、编码、管理体系、查询分组、共享编码池等来自 `Company` 表；seed/migration 只负责初始化事实数据。
- 查询封装：公司相关判断必须通过领域 service/helper 从 DB 派生，禁止在调用方复制公司映射、分组数组或特殊判断。
- 通用框架约束：公司专有事实禁止硬编码在 `app/`、`server/`、`lib/`、`scripts/` 中，包括具体公司名、公司编码、管理体系、查询分组、共享编码池、特殊公司判断。此类信息必须来自 `Company` 表或 seed/migration 的输入数据，业务代码只允许通过领域 service/helper 查询和派生。

### 编码规则

- 部门：L1=`前缀001`，L2=`前缀100/200`，L3=`前缀101`
- 岗位：`GW-{dept}-{seq}`，GMP 岗位带 `PPA-` 前缀

## 12. 前端规范

共享组件必须使用，禁止重复造轮子：

| 组件 | 用途 | 导入 |
|------|------|------|
| `ConfirmModal` | 确认弹框 | `@workspace/core/ui` |
| `DetailModal` | 通用详情弹窗 | `@workspace/core/ui` |
| `Toolbar`（含 `edit-group`/`action-group`） | 统一工具栏，承载编辑、保存、取消、筛选、动作和元信息 | `@workspace/core/ui` |
| `Toast` + `useToast` | 通知提示 | `@workspace/core/ui` + `@workspace/core/hooks` |
| `AppShell` / `ModuleHome` | 登录后页面壳和模块首页 | `@workspace/platform/ui` |

规范：

- 确认弹框用 `<ConfirmModal>`，禁止 `window.confirm`。
- 下拉、筛选、日期、tag、表格、页面模板的完整复用规则见 `docs/engineering/reusable-components.md`。
- 业务包和页面不能手写原生 `<select>`、浏览器默认日期输入或一次性搜索框；必须使用 Core 组件或基于 Core 的 App 字段组件。
- 选择面板和字段展示必须解耦。字段展示保持统一样式；选择面板可以是普通下拉、分级选择、FK 搜索、tag 选择。
- 通知用 `useToast()`，禁止裸 `setTimeout`。
- 公司名、编码、管理体系通过 API 或领域 service/helper 获取，禁止硬编码。
- API 鉴权优先走 `@workspace/platform/server/auth`；旧 `lib/auth.ts` 聚合 hub 已删除，不要恢复同类兼容入口。
- 搜索优先用 `@workspace/core/search` 的通用匹配；业务语义搜索留在对应业务包。
- 当前用户类型从 `@workspace/platform/types` 导入 `SessionUser`，禁止页面内重复定义 `interface User`。
- 业务页面 facade 负责组合，不承载大段业务逻辑；超过 150 行应拆 components/hooks。
- 组件或 hook 以 220 行为新代码目标，service 以 260 行为新代码目标；package lint 硬上限是 TSX 500 行、TS 550 行。拆分必须降低理解成本，不能只是为过行数红线搬家。`lint:changed` 不检查净增行；清债/重构跑 `check:refactor`，手动总行数预算跑 `complexity:line-budget`。
- 新业务模块必须有 `types.ts`、必要 hooks/components，以及 `ARCHITECTURE.md`。
- 禁止在页面里直接堆 fetch、权限判断、复杂映射和计算；这些应分别下沉到 hook、API/service、权限 helper。

## 13. Package 契约速查

| 模块 | 用途 | 关键导出 |
|------|------|----------|
| `@workspace/core/ui` | 通用 UI | 确认弹框、Toast、表格、筛选、字段、日期、状态、金额/数字单元格 |
| `@workspace/core/hooks` | 通用 hook | `useCSV`、`useToast` |
| `@workspace/core/routing` | 路由 helper | `workspacePath` |
| `@workspace/core/search` | 通用搜索 | 拼音首字母、全拼和文本匹配 |
| `@workspace/platform/ui` | 平台壳 UI | `AppShell`、`ModuleHome`、`PortalClient`、`UserMenu`、审计日志 UI |
| `@workspace/platform/types` | 平台类型 | `SessionUser`，全站统一 |
| `@workspace/platform/server/auth` | 认证鉴权 | `authenticate`、`authorize`、`requireAuthorized` 和已委托 `authorize()` 的领域 wrapper；新代码不要直接调用 `checkPermission` |
| `@workspace/platform/server/prisma` | 数据库 | 单库 Prisma runtime client |
| `@workspace/platform/server/history` | 审计 | `snapshotHistory` |
| `@workspace/platform/server/crud-factory` | 通用 CRUD 工厂 | 业务包通过本领域 wrapper 复用 |
| `@workspace/platform/server/resolve-fk` | FK 展示名 | 审计和 DTO 中的 FK 快照显示名解析 |
| `@workspace/hr/server` | HR 业务服务 | HR 查询、保存、导入、校验、DTO |
| `@workspace/hr/ui` | HR UI | 员工资料、部门岗位、项目资料等 HR 页面组件 |
| `@workspace/work/server` | Work 业务服务 | 工作计划、项目管理、工作汇报和目标权限 |
| `@workspace/production` | 生产包 | 生产/QC 模块注册、类型和后续 UI/server |
| `@workspace/finance` | 财务包 | 财务模块注册、类型和后续 UI/server |
| `lib/security.ts` | 登录安全 | `checkBruteForce`, `recordAttempt` |
| `@workspace/platform/permissions` | 业务空间 helper | `businessSpaceKindLabel`, `businessSpaceGroupTitle` |
| `@workspace/core/period` | 周期计算 | `getCurrentPeriod`, `getPeriodRange`, `getPeriodOptions`, `PeriodType` |

`lib/*` 中的旧 runtime 入口只用于兼容存量代码，新代码不要直接依赖；业务包必须通过 Platform server 契约或本包 service 访问。

## 14. 检查约束

普通局部交付默认只运行 `npm run check:changed`。涉及架构/权限再加 `npm run arch:gate`；需要类型诊断时只跑 `npm run typecheck:scope -- <package>`。全仓 lint、typecheck 和 build 不是小改动的本地默认项，由 CI/发布收口。

提交规则：

- 每次完成一个独立任务后要提交 commit。
- commit 前先看 `git status`，不要把无关文件、`.env`、数据库、`.DS_Store`、临时 planning 文件提交进去。
- 已有用户或其他 agent 的改动不得回滚；如需跨任务整理，单独开治理任务。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、AGENTS/docs 或对应 `ARCHITECTURE.md`。
