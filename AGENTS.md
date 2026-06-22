<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Entry

这是 agent 入口，只保留开工前必须知道的硬约束和文档导航。文档总目录见 `docs/README.md`；新 agent 开工卡片见 `docs/agent-startup.md`。不要把长篇架构、部署、数据库或 UI 规范继续堆回这里。

## 项目速记

- **栈**: Next.js 16 + React + TypeScript + Tailwind CSS + Prisma + SQLite。
- **定位**: 内部管理系统，会继续扩展 HR、财务、库存、合同、绩效、采购、生产等模块。
- **目录契约**: 当前是 `Core -> Platform -> Apps` 三层多包。新增/重构代码优先进入 `packages/core`、`packages/platform`、`packages/<domain>`；`app/(modules)/<domain>/` 和 `app/api/modules/<domain>/` 只保留 Next 路由壳，不能继续承载复杂业务实现。
- **当前改造方向**: Workspace 正在按 `Core -> Platform -> Apps` 拆成 `packages/core`、`packages/platform`、`packages/hr`、`packages/work`、`packages/production`、`packages/finance` 等包。旧 `app/`、`app/api/`、`lib/`、`server/services/` 只作为路由壳或兼容层逐步收口，新代码必须顺着包边界走，不要按旧思路继续把业务、平台和通用组件混在一起。
- **并行协作提醒**: 原 Project / EmployeeProject 已定向剥离到 Work 业务包，相关边界见 `docs/agent-coordination-work-split.md`；其他 agent 不要继续在 HR 中新增 Project / EmployeeProject 能力，也不要新增 `packages/project`。
- **核心原则**: DB 存事实，Service 算结果，API 返回 DTO，UI 展示结果，文档解释边界，CI 拦住越界。
- **Level 1/1.5 硬门禁**: `npm run arch:gate` 是唯一架构入口，会串行执行 AST 扫描、dependency-cruiser DAG、`moduleDefinition` 注册校验、app route hierarchy、`authorize()`/API 结构校验和包边界检查，任一失败立即退出。新增代码绕过 Core UI、跨业务包 import、缺模块注册、API 新增裸 `checkPermission` 或裸 Prisma，都会失败。Level 1.5 的历史债由 `scripts/arch/level15-baseline.json` 锁定，只能随迁移减少，不能新增。
- **Level 2 结构智能**: `npm run arch:level2` 输出确定性结构报告，覆盖 UI pattern 重复、API Contract 覆盖、API route 模板漂移、旧 service 迁移债和 app 层 JSX 存量。已升级为强制的 Level 2 漂移通过 `scripts/arch/level2-baseline.json` 接入唯一 `arch:gate`，baseline 只能减少，不能新增；搜索型原生 input 的 baseline 为 0，只允许 Core `SearchInput` 内部实现。
- **CI/CD**: CI 只走公开 GitHub Actions；CNB 只负责私有 CD/生产发布。生产发布必须先 commit，并同步 push 到 GitHub 与 CNB，再用 CNB API/CLI 触发 `api_trigger`。细节见 `docs/ops/deploy.md`。

## Agent 接力协议

- **先定角色再动手**: 角色边界不清时先停下同步。角色细则只看对应 `docs/roles/*.md`，不要把其他角色的执行细节复制到当前任务上下文。
- **先看工作区**: 开始前运行 `git status --short`，识别其他 agent 的改动。只提交自己负责的文件；不要顺手格式化、回滚、stash-pop 或 stage 别人的范围。
- **只认单 gate**: 架构验证只有 `npm run arch:gate`。不要在 CI 或本地新增平行架构检查，也不要把 Level 2 发现做成本地私有规则。
- **Level 2 工作方式**: `npm run arch:level2` 用来发现结构漂移并拆成文件级任务；Architecture agent 不直接实现业务功能，只输出可执行迁移包或修改治理基础设施。真正强制的项必须进入 `arch:gate`，baseline 只能减少，不能为新违规扩写。
- **Level 2 三件套**: AST/pattern scan 在 `scripts/arch/level2.ts`，模块注册锁在 `packages/platform/module-registry.ts`，API Contract 在 `packages/platform/api-registry.ts`。Core UI 可用组件清单在 `packages/core/ui/component-registry.ts`，作为 AST/pattern scan 的输入，不是第四套 gate。其他 agent 只消费这些结果，不另建 registry、扫描器或本地规则。
- **交接要可执行**: 给其他 agent 的任务必须写清楚目标文件、动作类型（move/delete/refactor/rewrite）、归属角色、依赖顺序、验证命令和不能碰的并行范围。不要只写“优化/收敛/统一”这类抽象目标。
- **接到迁移包再开工**: Feature/Data/Operations agent 收到 Architecture 任务包后，只执行列出的文件动作；发现需要改 gate、registry、baseline 或跨包规则时，先回传 Architecture，不要私自补旁路规则。

## 文档入口

Agent 不要只靠目录名猜架构。先按角色读，再按任务专题读，交付说明里写明参考了哪些文档。

| 如果你是 | 先读 |
|---|---|
| Architecture | `docs/roles/architecture.md` |
| Feature | `docs/roles/feature.md` |
| Operations | `docs/roles/operations.md` |
| Data | `docs/roles/data.md` |
| Review | `docs/roles/review.md` |

| 需要什么 | 入口 |
|---|---|
| 文档总目录和专题索引 | `docs/README.md` |
| 开工分流和任务包格式 | `docs/agent-startup.md`, `docs/SUBAGENT.md` |
| Level 2 任务包执行 | `docs/level2-agent-execution.md` |
| Production/QC 字段语义 | `docs/reference/qc-dev-mode.md` |
| Next.js 16 行为 | `node_modules/next/dist/docs/` 中相关文档 |

## 开发红线

- 新业务代码必须落到对应 package/domain，禁止借壳塞进 HR、Finance、通用 `lib/` 或 route 文件。
- 新增或重构代码必须符合当前 Core / Platform / Apps 方向：通用 UI/字段/弹窗/分页/表格/页面骨架进 Core，登录权限/导航/审计/平台壳进 Platform，HR/Finance/Production/Work/Administration/Library 各自进业务包。不要新增 app-root runtime 依赖来绕过包边界。
- 页面骨架统一用 Core `PageShell`，登录后平台页面用 Platform `AppShell`（内部复用 `PageShell`）。业务包禁止自己长期手写 sticky header、返回栏、通用标题栏或横向页面导航。
- 页面设计 primitive 必须来自 Core UI registry。`PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`FilterToolbar`、`DataTable`、`SplitWorkspace`、`SearchInput`、`SelectField`、`FkFieldInput` 等入口必须先在 `packages/core/ui/component-registry.ts` 注册，非 Core 包引用未注册 Core UI 或新增手写页面壳文件会被 `npm run arch:gate` 的 Level 2 ratchet 拦截。Core UI 新 value export 也必须登记，registry 重名和已导出未登记的 baseline 都是 0。新增注册项必须填写中文 `description`、中文 `example` 和必要的 `includes`；若需要可视化示例，还要在 `RegistryBrowserCard` 的 `ComponentPreview` 增加对应 case。
- 下拉、搜索、筛选、日期、确认弹窗、Toast、表格、分页、Tab、页面模板先查 `docs/reusable-components.md`；已有 Core/Platform/App 组件时禁止重复造车，字段展示和选择面板必须解耦。页面或业务包不得手写 `type="search"` 或 `placeholder/aria-label` 带搜索语义的原生 input，必须用 Core `SearchInput`、`FkFieldInput`、`SelectField` 或 `OptionPicker`。`npm run arch:gate` 会检查疑似重复基础组件文件名和搜索型原生 input，新增例外必须写入脚本 allowlist 并说明迁移计划。
- 页面模板按 `A Core 源头层 -> B 薄壳 ViewModel -> C 渲染` 收口：A 可以由 A1/A2/A3/A4 等多个 Core 子组件、类型、动作和弹窗组合，不要求塞进单个文件；业务包只把业务数据映射成 Core 暴露的 ViewModel 并挂真实 callback。不要为了页面样式预览再维护一套 B2；如果暂时没有共用的真实 B，就不要强行做模板预览。用户反馈样式、折叠、默认按钮、toolbar 等通用体验不满意时，优先改 Core 源头层 A；业务状态、真实回调和特化弹窗留在 B/C。
- 页面和 API 权限都必须从 registry 派生：页面 shell 用 `requireRouteAccess("<href>")`，API route 用 `requireApiAccess(request)` 或已经接入它的 `with-auth` wrapper。业务页面/API 不得手写 resource key 作为主门禁；resourceKey、action、runtime enabled/disabled 必须由 `packages/platform/module-registry.ts` 和 API contract 推导。`checkPermission`、`hasAccess`、`canAccess`、`roleCheck`、`rbacCheck` 等替代入口会被 `npm run arch:gate` 拦截。
- 每个业务包必须在 `packages/<domain>/module.ts` 导出 `moduleDefinition`，并通过 `packages/platform/module-registry.ts` 的 `registeredModuleDefinitions` 注册；未注册、重复 key、绕过 registry 的模块都视为无效。`packages/project` 禁止新增，项目/工作清单/工作汇报/历史记录统一归 Work。
- L2 是模块注册里的业务入口单元，也就是 `moduleDef.children[*]` 中用户认知的二级功能。每个 L2 必须同时具备四件套：直接二级页面 route（例如 `/finance/statement-config`、`/production/qc-batches`）、同名 resourceKey（例如 `finance.statementConfig`、`production.qcBatches`）、明确 API contract 前缀或 `noApiReason`、以及权限页可授权的 RBAC resource。禁止用嵌套三级页面伪装 L2，也禁止多个 L2 共用一个资源。
- 模块运行态优先于业务对象权限：L1/L2 模块 disabled 后，对应入口、页面、API、FK、视图和对象级辅助资源都必须失效。资源 `parentKey` 只表达 RBAC 权限继承；不能继承父权限、但必须随模块启停的资源使用 `runtimeParentKey`，例如 `work.projects.viewAll` 不继承 `work.projects`，但随 `work.projects` disabled 一起失效。
- App 页面、API contract、RBAC resource 和权限页授权树必须由同一份 module registry 派生。新增 L1/L2 时只在 `packages/platform/module-registry.ts` 增加 `moduleDef` / `children` / `resourceKey` / `href` / `apiPrefixes` 或 `noApiReason`，不要再维护第二套导航、API 清单或资源树。
- 删除 L1/L2 时必须同步删除真实 app route、API route、registry child/resourceKey 和相关 docs；`scripts/seed-resources.ts` 会清理 DB 中不再注册的 stale resources 及其授权。禁止留下 hidden/disabled 旧 resource 或 410 旧 API contract 作为“兼容层”，除非任务明确要求保留兼容。
- L2 以下 capability 不进入全局页面 L2；只能作为 `resourceDefs` 注册，必须声明 `capabilityOwnerKey`，不能用 `parentKey` 继承 owner 权限；若需要跟随模块禁用，设置 `runtimeParentKey`。`settings.account` 是登录用户自助 contract，标记 hidden，不进入普通 RBAC 授权矩阵。
- Work 业务体验调整只改 `packages/work` / `app/(modules)/work` / `app/api/modules/work/*` 或必要 Core UI 基建。`/work/projects` 列表展开目标是左右分栏，不要用遮罩式整屏 overlay 灰掉详情区；若抽通用可折叠分栏，放 Core，Work 只接业务数据。
- `/work/projects` 是项目对象级权限模型：`work.projects.access/write/delete` 只代表可进入/发起项目功能，不代表查看全部、管理全部或删除全部项目。项目可见/可写由 `Project.createdBy`、主导部门负责人、项目 RASCI 成员、显式 `work.projects.viewAll` 和 system admin 判定；`editedBy` 只作审计字段。
- API 一级目录只表达系统能力类型：`auth`、`agent`、`settings`、`modules`、`integrations`、`open`。业务模块只能出现在内部 `/api/modules/<module>` 之后；外部开放接口只能出现在 `/api/open/v1/**` 并通过 Open API registry 注册。禁止新增 `/api/hr`、`/api/finance`、`/api/work`、`/api/employees` 等一级业务目录或 redirect/compat 旁路。API route 只做认证、权限、参数校验、调用 package service、返回 DTO。
- FK 候选项查询是通用机制，但 API 入口必须保留业务模块权限边界，例如 `app/api/modules/hr/roster/reference-options`、`app/api/modules/work/projects/reference-options`；route 只做权限壳并调用对应包 service 或 Platform factory，业务 FK 特例必须留在业务包内，Platform 只能消费 `packages/platform/module-registry.ts` 中的模块契约聚合能力，禁止手写 import 某几个业务包拼业务能力。
- `scripts/arch/scan.ts`、`dependency-cruiser.config.cjs` 和 `scripts/check/check-package-boundaries.js` 共同执行 DAG：Core 不依赖 Platform/Apps，Platform 不直接 import 业务包实现，业务包之间不直接互相 import，业务包不能用 `@/server/*` 等 alias 绕过包边界，依赖图禁止循环。
- `app/` 是路由层，不是 UI 实现层。历史 app UI 文件、route-local hook/helper 文件和 `components/hooks/lib` 目录被 Level 1.5 baseline 锁定；新增页面组件、表单、筛选、表格、弹窗、业务渲染或无 JSX 的实现文件必须迁入 `packages/platform/ui` 或对应 `packages/<domain>/ui` 后由 route shell 挂载。
- 页面按钮隐藏不是安全边界；所有写入和删除必须在 API 层校验。
- 公司名、公司编码、管理体系、查询分组、共享编码池等公司事实必须来自 `Company` 表或 seed/migration 输入，业务代码只能通过领域 service/helper 查询和派生。
- 文件大小是 ESLint 硬约束：API route 120 行，页面 facade 150 行，app 层 UI 220 行，root `server/**/*.ts` 260 行；packages 迁移期 lint fallback 为 TSX 400 行、TS 450 行、Core 300 行。新建或重构的 package UI/hook 目标 220 行、server service 目标 260 行，超目标先按职责拆分，不要靠扩大阈值绕过。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、docs 或对应 `ARCHITECTURE.md`。

## 检查与提交节奏

不要在每个小改动后机械跑完整检查。开发中可以按文件或功能批次做轻量验证；只有到了明确收尾点才强制检查和提交。

## 交付前检查

交付前按改动风险选择检查命令，并在最终说明里写清楚已运行的验证。涉及 API、权限、package 边界、registry、Core/Platform 基建或架构文档时，必须包含 `npm run arch:gate`；普通 TS/TSX 改动至少包含 `npm run lint:changed` 和 `npm run typecheck:quick`。准备 commit 前必须先看 `git status --short`，只提交本任务相关文件。

强制收尾点：

- 准备 commit 前。
- 一个独立任务完成后。
- 用户明显切换到新话题前，且当前话题已有文件改动。
- 要交给其他 agent、Review 或部署前。

收尾时先运行 `git status --short`，只 stage 本任务文件；不要提交无关文件、`.env`、数据库、`.DS_Store` 或临时 planning 文件。已有用户或其他 agent 的改动不得回滚。

检查选择按风险定：

- 文档或规则说明：至少跑相关文档检查，例如 `npm run docs:check`。
- 普通 TS/TSX 小改动：至少跑 `npm run lint:changed` 和 `npm run typecheck:quick`；涉及架构边界时加 `npm run arch:gate`。
- UI 行为改动：除上面命令外，按需做浏览器/截图验证。
- API、权限、package 边界、registry、Core/Platform 基建：必须跑 `npm run arch:gate`。
- schema、导入、部署、构建链路或共享行为：跑完整组：

```bash
npm run arch:gate
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

commit 前不能跳过检查；pre-commit 的 `check:quick` 也不能用 `--no-verify` 绕过。若检查因无关并行改动失败，先确认失败归属，只提交自己范围，并在交付说明里写清楚未解决的外部风险。
