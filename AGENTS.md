<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Entry

这是 agent 入口，只保留开工前必须知道的硬约束和文档导航。详细规则见 `docs/agent-handbook.md`；不要把长篇架构、部署、数据库或 UI 规范继续堆回这里。

## 项目速记

- **栈**: Next.js 16 + React + TypeScript + Tailwind CSS + Prisma + SQLite。
- **定位**: 内部管理系统，会继续扩展 HR、财务、库存、合同、绩效、采购、生产等模块。
- **目录契约**: 当前是 `Core -> Platform -> Apps` 三层多包。新增/重构代码优先进入 `packages/core`、`packages/platform`、`packages/<domain>`；`app/<domain>/` 和 `app/api/<domain>/` 只保留 Next 路由壳，不能继续承载复杂业务实现。
- **当前改造方向**: Workspace 正在按 `Core -> Platform -> Apps` 拆成 `packages/core`、`packages/platform`、`packages/hr`、`packages/work`、`packages/production`、`packages/finance` 等包。旧 `app/`、`app/api/`、`lib/`、`server/services/` 只作为路由壳或兼容层逐步收口，新代码必须顺着包边界走，不要按旧思路继续把业务、平台和通用组件混在一起。
- **并行协作提醒**: 原 Project / EmployeeProject 已定向剥离到 Work 业务包，相关边界见 `docs/agent-coordination-work-split.md`；其他 agent 不要继续在 HR 中新增 Project / EmployeeProject 能力，也不要新增 `packages/project`。
- **核心原则**: DB 存事实，Service 算结果，API 返回 DTO，UI 展示结果，文档解释边界，CI 拦住越界。
- **Level 1/1.5 硬门禁**: `npm run arch:gate` 是唯一架构入口，会串行执行 AST 扫描、dependency-cruiser DAG、`moduleDefinition` 注册校验、`authorize()`/API 结构校验和包边界检查，任一失败立即退出。新增代码绕过 Core UI、跨业务包 import、缺模块注册、API 新增裸 `checkPermission` 或裸 Prisma，都会失败。Level 1.5 的历史债由 `scripts/arch/level15-baseline.json` 锁定，只能随迁移减少，不能新增。
- **Level 2 结构智能**: `npm run arch:level2` 输出只读结构报告，覆盖 UI pattern 重复、API Contract 覆盖、旧 service 迁移债和 app 层 JSX 存量。它不替代 `arch:gate`，也不单独进入 CI hard gate；需要升级成硬约束时必须并入单一 `arch:gate`。
- **部署**: 本地不直连服务器部署；生产发布必须先 commit/push 到 CNB，再用 CNB API/CLI 触发 `api_trigger`。细节见 `docs/ops/deploy.md`。

## QC 开发模式字段速记

- QC 表格真源判断：PNG 截图只是线索，可能被 DOCX→PDF 转换、分页、裁剪边界或跨页表格截断/错位/遮挡。看到表格断裂、标题与表格不连续、页眉页脚混入、明显少行少列时，必须回看相邻截图、PDF 原页、MD 和 DOCX 上下文，人工判断真实 `layout_blocks`，不能只按单张 PNG 复刻。
- `i`: 普通可填字段；没有公式元数据，也不是任何公式的依赖输入。
- `x`: 公式输入字段；它被同一作用域内某个 `method_groups[].fields[]` 的 `formula/rule` 引用，点击对应 `f(x)` 时应高亮。
- `f(x)`: 公式输出字段；通常是 `attr: calculated` 且有 `formula/rule`，或 layout part 明确带 `advancedFormulaText/advancedDependencyFieldKeys`。点击后提示公式和对应 `x`。
- `ref`: 完全引用别的字段值，不是新计算；包括跨阶段复制的 `reference_field_key/value_source`、公式表达式只是某个同作用域字段名、以及同一个 `fieldKey` 的重复只读展示。
- `date`: 日期输入字段。若日期是引用值，开发模式显示 `ref`。
- `data`: 原始数据、图谱、附件类 block，当前主要通过 `attachment_upload`/hidden `data-field-key` 承载，不走 `i/x/f(x)/ref` 的普通字段 badge。
- `✓`: checkbox/radio 选择字段。若它同时是引用或公式依赖，按引用/公式优先显示。
- `param`: 静态参数文本或预置参数，不参与填写和计算。
- 同一个 part 理论上可能同时命中多种语义，显示优先级固定为 `ref > f(x) > x > i`；checkbox/radio/date 是输入类型的显示标签，仍服从引用和公式优先级。
- 写 QC JSON/layout 时，表格必须保留 `layout_blocks` 结构，不能把 MD 表格退化成段落文本。计算结果格使用稳定 `fieldKey` + `readonlyDisplay: true`，并在同一 test 的 `method_groups` 中提供同名 `attr: calculated` 字段和公式；普通输入使用同一组公式可引用的稳定 `fieldKey`。只有“值完全相同”才复用同一 `fieldKey` 或写 `reference_field_key/value_source`。

## 开工先读

Agent 不要只靠目录名猜架构。命中多个条件时全部读取，交付说明里写明参考了哪些文档。

| 任务类型 | 必读文档 |
|---|---|
| 跨目录、跨模块、超过单文件的小改动 | `README.md`、`docs/architecture-governance.md`、`docs/agent-handbook.md` |
| 评估架构优化、整理目录、治理债 | `docs/core-platform-apps-migration-map.md`、`docs/planning/architecture-optimization-roadmap.md`、`docs/architecture-governance.md` |
| 新增业务模块 | `README.md`、`docs/architecture-governance.md`、`docs/planning/new-domain-template.md`、`docs/new-module-checklist.md` |
| 已有模块内新增 Tab、审核流、规则页、CRUD | `docs/existing-module-feature-checklist.md`、对应模块 `ARCHITECTURE.md` |
| 新增或修改下拉、搜索、筛选、日期、确认弹窗、表格、页面模板 | `docs/reusable-components.md`、`docs/module-boundaries.md` |
| 修改 Prisma schema、migration、seed、导入脚本 | `docs/schema-governance.md`、`docs/database.md`、对应模块 `ARCHITECTURE.md` |
| 修改权限、授权、后台权限 UI、资源树 | `docs/security/rbac.md`、`docs/architecture-governance.md`、`lib/permissions.ts` |
| 修改 HR 模块 | `app/hr/ARCHITECTURE.md` |
| 修改财务成本模块 | `app/finance/cost/ARCHITECTURE.md` |
| 修改环境变量、`.env.example`、部署脚本、CI | `docs/ops/environment.md`、`docs/ops/deploy.md` |
| 使用 Next.js 路由、构建、缓存、Server Component 等能力 | `node_modules/next/dist/docs/` 中相关 Next.js 16 文档 |

## 开发红线

- 新业务代码必须落到对应 package/domain，禁止借壳塞进 HR、Finance、通用 `lib/` 或 route 文件。
- 新增或重构代码必须符合当前 Core / Platform / Apps 方向：通用 UI/字段/弹窗/分页/表格/页面骨架进 Core，登录权限/导航/审计/平台壳进 Platform，HR/Finance/Production/Work/Administration/Library 各自进业务包。不要新增 app-root runtime 依赖来绕过包边界。
- 页面骨架统一用 Core `PageShell`，登录后平台页面用 Platform `AppShell`（内部复用 `PageShell`）。业务包禁止自己长期手写 sticky header、返回栏、通用标题栏或横向页面导航。
- 下拉、搜索、筛选、日期、确认弹窗、Toast、表格、分页、Tab、页面模板先查 `docs/reusable-components.md`；已有 Core/Platform/App 组件时禁止重复造车，字段展示和选择面板必须解耦。`npm run arch:gate` 会检查疑似重复基础组件文件名，新增例外必须写入脚本 allowlist 并说明迁移计划。
- API route 只做认证、权限、参数校验、调用 service、返回 DTO；新增权限判断必须通过 `server/auth/authorize.ts` 的 `authorize()` 或委托给已经使用 `authorize()` 的平台 wrapper。`checkPermission`、`hasAccess`、`canAccess`、`roleCheck`、`rbacCheck` 等替代入口会被 `npm run arch:gate` 拦截。
- 每个业务包必须在 `packages/<domain>/module.ts` 导出 `moduleDefinition`，并通过 `packages/platform/module-registry.ts` 的 `registeredModuleDefinitions` 注册；未注册、重复 key、绕过 registry 的模块都视为无效。`packages/project` 禁止新增，工作计划/工作清单/工作汇报/历史记录统一归 Work。
- `scripts/arch/scan.ts`、`dependency-cruiser.config.cjs` 和 `scripts/check/check-package-boundaries.js` 共同执行 DAG：Core 不依赖 Platform/Apps，Platform 不直接 import 业务包实现，业务包之间不直接互相 import，业务包不能用 `@/server/*` 等 alias 绕过包边界，依赖图禁止循环。
- `app/` 是路由层，不是 UI 实现层。历史 app UI 文件被 Level 1.5 baseline 锁定；新增页面组件、表单、筛选、表格、弹窗、业务渲染必须迁入 `packages/platform/ui` 或对应 `packages/<domain>/ui` 后由 route shell 挂载。
- 页面按钮隐藏不是安全边界；所有写入和删除必须在 API 层校验。
- 公司名、公司编码、管理体系、查询分组、共享编码池等公司事实必须来自 `Company` 表或 seed/migration 输入，业务代码只能通过领域 service/helper 查询和派生。
- 文件大小是硬约束：页面 facade 150 行，组件/hook 220 行，API route 120 行，service 260 行。超限先拆分。
- 修改架构、schema、权限、导入流程时，必须同步更新 README、docs 或对应 `ARCHITECTURE.md`。

## 交付前检查

按改动风险选择必要检查；影响共享行为、权限、schema 或构建时必须跑完整组：

```bash
npm run arch:gate
npm run size:check
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

提交前先看 `git status --short`，不要提交无关文件、`.env`、数据库、`.DS_Store` 或临时 planning 文件。已有用户或其他 agent 的改动不得回滚。
