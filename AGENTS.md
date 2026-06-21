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
- **目录契约**: 当前是 `Core -> Platform -> Apps` 三层多包。新增/重构代码优先进入 `packages/core`、`packages/platform`、`packages/<domain>`；`app/<domain>/` 和 `app/api/modules/<domain>/` 只保留 Next 路由壳，不能继续承载复杂业务实现。
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
- API route 只做认证、权限、参数校验、调用 service、返回 DTO；新增权限判断必须通过 `packages/platform/server/auth/authorize.ts` 的 `authorize()` 或委托给 `@workspace/platform/server/auth` 中已经使用 `authorize()` 的平台 wrapper。`checkPermission`、`hasAccess`、`canAccess`、`roleCheck`、`rbacCheck` 等替代入口会被 `npm run arch:gate` 拦截。
- 每个业务包必须在 `packages/<domain>/module.ts` 导出 `moduleDefinition`，并通过 `packages/platform/module-registry.ts` 的 `registeredModuleDefinitions` 注册；未注册、重复 key、绕过 registry 的模块都视为无效。`packages/project` 禁止新增，工作计划/工作清单/工作汇报/历史记录统一归 Work。
- Work 业务体验调整只改 `packages/work` / `app/work` / `app/api/modules/work/*` 或必要 Core UI 基建。`/work/plans` 列表展开目标是左右分栏，不要用遮罩式整屏 overlay 灰掉详情区；若抽通用可折叠分栏，放 Core，Work 只接业务数据。
- API 一级目录只表达系统能力类型：`auth`、`me`、`system`、`modules`、`integrations`。业务模块只能出现在 `/api/modules/<module>` 之后；旧 `/api/hr`、`/api/finance`、`/api/work`、`/api/employees` 等一级业务目录只作为 compatibility proxy 迁移期保留。API route 只做认证、权限、参数校验、调用 package service、返回 DTO。
- FK 候选项查询是通用机制，但 API 入口必须保留业务模块权限边界，例如 `app/api/modules/hr/reference-options`、`app/api/modules/work/reference-options`；route 只调用 Platform factory，不写业务查询，Platform 只能消费 `packages/platform/module-registry.ts` 中的模块契约聚合能力，禁止手写 import 某几个业务包拼业务能力。
- `scripts/arch/scan.ts`、`dependency-cruiser.config.cjs` 和 `scripts/check/check-package-boundaries.js` 共同执行 DAG：Core 不依赖 Platform/Apps，Platform 不直接 import 业务包实现，业务包之间不直接互相 import，业务包不能用 `@/server/*` 等 alias 绕过包边界，依赖图禁止循环。
- `app/` 是路由层，不是 UI 实现层。历史 app UI 文件、route-local hook/helper 文件和 `components/hooks/lib` 目录被 Level 1.5 baseline 锁定；新增页面组件、表单、筛选、表格、弹窗、业务渲染或无 JSX 的实现文件必须迁入 `packages/platform/ui` 或对应 `packages/<domain>/ui` 后由 route shell 挂载。
- 页面按钮隐藏不是安全边界；所有写入和删除必须在 API 层校验。
- 公司名、公司编码、管理体系、查询分组、共享编码池等公司事实必须来自 `Company` 表或 seed/migration 输入，业务代码只能通过领域 service/helper 查询和派生。
- 文件大小是 ESLint 硬约束：API route 120 行，页面 facade 150 行，app 层 UI 220 行，root `server/**/*.ts` 260 行；packages 迁移期 lint fallback 为 TSX 400 行、TS 450 行、Core 300 行。新建或重构的 package UI/hook 目标 220 行、server service 目标 260 行，超目标先按职责拆分，不要靠扩大阈值绕过。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、docs 或对应 `ARCHITECTURE.md`。

## 交付前检查

按改动风险选择必要检查；影响共享行为、权限、schema 或构建时必须跑完整组：

```bash
npm run arch:gate
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

提交前先看 `git status --short`，不要提交无关文件、`.env`、数据库、`.DS_Store` 或临时 planning 文件。已有用户或其他 agent 的改动不得回滚。
