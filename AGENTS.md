<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Entry

本文件只放 always-on 开工入口和硬红线。开发 agent 的角色流程放在 `.agents/skills/`；给人阅读和共同维护的工程/产品事实仍按 `docs/README.md` 分层。

## Environment Authority

- `workspace-dev:/home/ubuntu/workspace-dev/worktrees/main` 是唯一可写开发工作区；正式 diff、检查、commit 与 CNB push 只在这里执行。
- `/Users/koito/Project/workspace/workspace` 是只读镜像，不在 Mac checkout 编辑、stage、commit 或 push。`workspace-dev:/home/ubuntu/workspace-dev/release` 是部署阶段已有的发布指针，不是开发工作区。
- 开发任务禁止运行 `git worktree add/move`、新建并行 checkout、切换或改名 `main`、用 reset/rebase 让 `main` 对齐另一分支，也禁止在 `source` 或 `release` 上开发。所有任务在现有 `worktrees/main` 顺序提交；需要隔离检查时使用仓库受治理的检查入口，不建立长期工作树。
- 只有明确进入部署流程且 exact `main` SHA 已通过 required CI 后，才允许在已有 `release` checkout 执行 `git merge --ff-only main`。`release` 禁止 merge commit、rebase、cherry-pick、reset 或直接编辑；它只是已验证源码指针，不替代 CNB 的 SHA/tree/image digest/release receipt。
- CNB 是唯一源码平台、CI、应用构建、Registry、CD、回滚和审计平台；required CI 通过后只构建一次 `linux/amd64` OCI 镜像并绑定 SHA/tree/digest。
- 远端权威 `main` 只提交源码到 CNB，不中转构建制品或生产部署；生产服务器不 checkout 源码，只按 CNB Registry digest 部署。
- Agent 开工时查询基线，推送前运行受影响快速检查，推送后主动跟踪 exact SHA 的 CNB Build ID、required CI、镜像 digest、演练、部署阶段及最终健康与线上 digest；交付前必须刷新远端状态，不得要求用户代查。

## Start Here

1. 先读本文件，确认宿主环境、权威工作目录和硬红线。
2. 在任何深度源码搜索、编辑或检查前，先选角色：Codex 调用 `$workspace-role-router`，Claude Code 调用 `/workspace-role-router`（真源为 `.agents/skills/workspace-role-router/SKILL.md`）。
3. 选择一个主角色；读取 router 后的第一条角色声明更新应包含环境、主角色、辅助角色和将读取的专题文档，然后完整读取对应 role skill。此前可以只报告正在确认环境。
4. 不要先扫全库；再读 `docs/engineering/project-overview.md`，确认项目地图、事实来源和新鲜度。
5. 涉及具体模块时，再读 `app/(modules)/*/ARCHITECTURE.md` 或 `MODULE.md`。
6. zsh 搜索含括号路径时要加引号或转义，例如 `rg foo 'app/(modules)/work'`，避免被 `()` 当成 glob 语法。

| 主角色 | 选择条件 | Skill |
|---|---|---|
| Coordinator | 规划、拆任务、多 agent、跨模块依赖、集成收口 | `workspace-coordinator` |
| Feature | UI、业务功能、页面/API 壳、业务 service、普通 bug | `workspace-feature` |
| Architecture | 架构边界、registry、RBAC/API contract、Core/Platform/App 规则 | `workspace-architecture` |
| Data | schema、migration、seed、导入/导出、生成数据 | `workspace-data` |
| Operations | CI、部署、环境、构建、脚本运行态 | `workspace-operations` |
| Hygiene | 历史债、baseline、lint/arch 漏洞、重复实现清理 | `workspace-hygiene` |
| Review | 完成后的独立 review；不能审自己实现或集成的改动 | `workspace-review` |

## Document Map

| 层 | 位置 |
|---|---|
| Agent 角色流程 | `.agents/skills/workspace-*/SKILL.md`；Claude Code 入口为 `.claude/skills/*` 软链接 |
| 工程规范 | `docs/engineering/*` |
| 生成文档 | `docs/generated/*` |
| 模块长期知识 | `app/(modules)/*/ARCHITECTURE.md`, `app/(modules)/*/MODULE.md` |
| 用户/产品文档 | `docs/product/*`, `app/(modules)/docs/*` |
| 文档 owner 和 stale 规则 | `docs/OWNERS.md` |
| 规划治理原则 | `docs/planning/README.md`；实际计划只放 Git 忽略的 `.planning/` |
| 特殊参考资料 | `docs/reference/*` |

## Hard Red Lines

1. **先读 Next.js 本地文档**：写 Next.js 相关代码前，先看 `node_modules/next/dist/docs/` 的对应说明。
2. **边界不能倒流**：Core 不依赖 Platform/Apps；Platform 不写业务 service/UI；业务包之间不直接 import。跨模块能力进 Platform contract 或 Core primitive。
3. **app 只做 shell**：`app/(modules)`、`app/(system)` 页面只做鉴权/预取/挂 package UI；API route 只做认证、权限、请求形状、调 service、返回 DTO。
4. **写入必须三段式**：`Zod schema -> domain validator -> service/Prisma`。不要让 Zod 或 route 承担业务授权、FK、状态、归属、跨字段规则。
5. **RBAC 四件套要同步**：app route、URL href、`resourceKey + RBAC`、API contract + guard 必须一致。改 registry resource 后跑 `npm run db:seed:resources`。
6. **Core UI 只改结构**：业务任务先组合 `@workspace/core/ui` 和 Platform primitives；有明确 UI-system/Architecture 授权时，UI agent 可同步修改结构声明、registry 和 gate，但不得声明颜色/间距/圆角/阴影、单字段/单 cell/单 label/icon 或业务专属 kind。
7. **不重复造基础设施**：表格、筛选、搜索、日期、确认、Toast、FK、权限、CRUD factory、delete guard、审计、Toolbar 等先查 `docs/engineering/reusable-components.md` 和 Core/Platform 现有能力。
8. **同页状态不整页导航**：tab、筛选、选中记录这类客户端状态不要用 `router.push/replace` 或 `<Link>` 硬同步 URL；深链用状态 + history API。
9. **删除要闭环**：删 L1/L2、route、API、registry child/resource、docs、seed resource 要同步，不能留下 stale 入口。
10. **不为兼容污染协议**：破坏式收敛时，不要因为兼容旧调用点而在公开 contract、声明项或 kind 分支里增加额外选项；不兼容应暴露出来并通过迁移解决。
11. **Playwright/Chrome 生命周期必须闭环**：默认使用 `npm run test:e2e` 和 `@playwright/test` fixture；禁止在 `tsx -e`、shell one-liner 或业务脚本中直接调用 `chromium/firefox/webkit.launch()`。确需手动启动 Browser 时只能经过 `scripts/testing/with-playwright.ts`，并保证 `try/finally`、`SIGINT/SIGTERM` 和最终 `browser.close()`；任务收尾必须通过 Playwright 进程检查。
12. **提交先 stage 本任务**：开始提交检查前先看 `git status --short` 并只 stage 本任务文件；pre-commit 只验证该 index 快照。不要回滚、格式化或提交别人的改动。
13. **先确认运行环境**：宿主项目入口声明的远端开发、容器、端口和生产边界优先。直接本地 checkout 才统一使用 `npm run dev` 的 3000 单实例；不得把外部映射端口误当成本地 dev 端口。需要端口连续性时按宿主规则取得并释放 `dev:guard` 租约。
14. **并发服从宿主模式，重检查始终串行**：是否启动 subagent 服从当前 system / collaboration mode。无论是否允许多 agent，都不并发执行 npm 检查、测试、构建、Prisma generate 或 dev server；发现已有同类进程时等待或复用。
15. **本地类型检查默认不运行**：普通开发、修复、review 和 commit 收口都不主动运行任何 `typecheck:*`。只在用户明确要求、任务直接修改 TypeScript 工程/类型基础设施或正在定位具体编译错误时做本地诊断；正式 CNB CI 固定运行一次权威 `typecheck:full`，不得把同一 project-reference 图拆成多次串行 scope。例外执行前必须先告知用户，且只串行跑一次最小 `typecheck:scope`；无法界定单一 scope 时才使用 `typecheck:quick`。禁止直接调用 TypeScript CLI 或绕过项目锁。
16. **本地检查内存硬上限 8GB**：本机受治理 typecheck、build、lint 和其他 Node 检查的 old-space 上限不得超过 `8192 MiB`，与开发应用容器 `10 GiB` 上限保留运行时余量；各入口必须使用 package script 声明的受治理上限。禁止临时取消上限或绕过检查锁重试。锁等待不足时可以提高 `CHECK_LOCK_TIMEOUT_MS` 或命令等待时间；在受治理上限内仍无法完成则停止并报告，交由 CI/发布门禁处理。
17. **UI 文案默认克制**：字段标签和选项已经能表达语义时，不再补解释、实现路径或技术细节；仅在防误操作、不可逆后果、合规要求或非显然约束下保留必要提示。
18. **生产制品只有一个 OCI digest**：CNB required CI 通过后，把同一次 Next standalone 构建包装成唯一 `linux/amd64` 应用镜像、直接推送 CNB Registry 并生成 `release.json`；同一流水线再执行 migration、锁、备份、切换、健康、回执与回滚演练。禁止第二次应用 build、生产现场安装或构建、可变 tag 部署和 Mac 制品中转。
19. **正式 CI 一次报全**：CNB required CI 在同一轮汇总独立源码失败；真实依赖项只在前置失败后停止。集中修复完整清单后再推送，不恢复本地 Ready/controller、blocker ledger、retry fence 或跨渠道回执控制面。
20. **开发只用一个工作树**：开发只在现有远端 `worktrees/main` 进行，禁止新增、移动或切换工作树，禁止改名/重置 `main` 来同步分支。只有部署阶段可把已通过 required CI 的 exact `main` 以 `git merge --ff-only main` 快进到已有 `release`；任何非 fast-forward 都必须停止，不得改写历史。

检查命令按 `docs/engineering/checks.md` 选择并串行执行。多 agent 任务由 Coordinator/Integrator 按顺序做一次最终统一验证，各 agent 不重复跑重检查。
