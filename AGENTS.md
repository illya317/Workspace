<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Entry

这是开工入口，不放长篇规范。先看本文件确定地图和红线，再按角色进入 `docs/roles/*.md`。文档总目录见 `docs/README.md`，开工卡片见 `docs/agent-startup.md`。

## 项目地图

```txt
app/*                         只做 Next route shell
  -> packages/platform        登录、权限、导航、模块注册、Portal、审计、平台壳
  -> packages/<domain>        HR / Finance / Work / Production / Administration / Library 业务 UI + service
  -> packages/core            通用 UI、字段、表格、筛选、日期、搜索、确认、Toast、页面骨架
```

- `app/(modules)/<domain>/**/page.tsx`：页面壳，只鉴权/预取/挂 package UI。
- `app/api/modules/<domain>/**/route.ts`：API 壳，只认证、权限、Zod 参数、调 service、返回 DTO。
- `app/(system)/**`、`app/api/settings/**`：平台系统页/API。

## 先按角色开工

| 你要做什么 | 先读 |
|---|---|
| 改 UI、修业务 BUG、加页面/API | `docs/roles/feature.md` |
| 改 schema、seed、导入、生成数据 | `docs/roles/data.md` |
| 改架构规则、registry、gate、baseline | `docs/roles/architecture.md` |
| 改 CI、部署、环境、脚本运行态 | `docs/roles/operations.md` |
| 做 review | `docs/roles/review.md` |
| 做周期性清债、baseline/lint 漏洞巡检 | `docs/roles/hygiene.md` |

常用专题：

| 主题 | 文档 |
|---|---|
| 开工流程和任务分流 | `docs/agent-startup.md` |
| Core/Platform 基础设施 | `docs/reusable-components.md` |
| Core UI 五层治理 | `docs/core-ui-governance.md` |
| Core Toolbar 规则 | `docs/core-toolbar.md` |
| 检查命令分层 | `docs/checks.md` |
| 架构边界和权限四件套 | `docs/architecture-governance.md` |
| Work 模块长期边界/权限 | `app/(modules)/work/MODULE.md` |
| Work 模块短期计划 | `app/(modules)/work/PLAN.md` |
| RBAC/默认权限/Open API | `docs/security/rbac.md`, `docs/security/permission-matrix.md` |
| 新模块 | `docs/new-module-checklist.md` |
| 现有模块新增能力 | `docs/existing-module-feature-checklist.md` |

## 项目硬规则

1. **三层边界**：Core 不依赖 Platform/Apps；Platform 不写业务 service/UI；业务包之间不直接 import。跨模块能力进 Platform contract。
2. **别重复造基础设施**：Core/Platform 已有页面壳、表格、筛选、搜索、日期、确认、Toast、FK、权限、CRUD factory、delete guard、审计、模块 registry。新增前先查 `docs/reusable-components.md` 和 `packages/core/ui/component-registry.ts`。
3. **Core UI 只走五层治理**：业务 runtime 只能从 `@workspace/core/ui` 直接 import `PageSurface`、`FormSurface`、`DataSurface`、`NavigationSurface`、`useFeedback`；type-only import 可作为兼容阅读层。UI 组件库主展示只显示 L1-L3，L4+ 是 Foundation / private impl / 更深实现细节。不得直接 import `Core Internal`、`Foundation`、`Private Impl`；不得新增业务包 Toolbar/Picker/Table/Modal/Date/Search 等重复基础 UI。改 `packages/core/ui/**`、Core UI registry 或 `/settings/ui` preview 必须是 UI-system/Architecture 任务，并用 `CORE_UI_CHANGE=1` 明确授权。完整规则见 `docs/core-ui-governance.md`。
   Platform 系统壳有独立治理口径：`AppShell -> PageShell`、`UserMenu -> DropdownMenu` 是 Platform-owned system shell candidates，不是业务 Page API，也不能加入业务 Surface allowlist。Agent 页面 UI 已停用，仅保留 API / bot 接入能力。
4. **权限四件套统一**：每个 L2 必须保持 `app route` / `URL href` / `resourceKey + RBAC` / `API contract + guard` 一一对应。页面用 `requireRouteAccess("<href>")`，API 用 `requireApiAccess(request)` 或接入它的 wrapper，从 registry 推导 resource/action。
   新增、改名或删除 `moduleDef.resourceKey`、`children[*].resourceKey` 或 `resourceDefs` 后，必须运行 `npm run db:seed:resources` 同步 DB `Resource` 表；这不是 Prisma schema 迁移，除非数据模型变了，不要为每个资源注册改 migration。
5. **写入三段式**：写入入口固定为 `Zod schema -> domain validator -> service/Prisma`。Zod 只校验请求形状并 strip；domain 只 pick 业务可写字段并校验 FK/状态/归属/跨字段规则；service 只接已验证 command，负责事务、版本、审计和落库。
6. **app 不是实现层**：页面组件、hook、表格、弹窗、业务计算、Prisma 写入都不能新增在 `app/` route 文件里。
7. **同页状态别走整页导航**：tab、筛选、选中部门/项目/记录这类同一个客户端体验内的状态切换，不要用 `router.push/replace`、`redirect` 或 `<Link>` 只为同步 URL；需要深链时用组件状态 + `window.history.pushState/replaceState`，并通过 `workspacePath` 处理 basePath、补 `popstate` 回读。`router` / `<Link>` 只留给真正跨页面或资源详情导航。
8. **Layout 父级语义优先**：字体、字号、字重、行高、居中等内容要素必须跟随引用主体；外观只允许 `intrinsic`、`parentLocked`、少数系统反馈 `selfLocked` 三类。父级声明语义和约束，子 UI 实现适配；冲突时父级 layout policy 优先，但父级只能用 Core 语义 context/policy，不得用自由 `className` 硬改基础尺寸。Toolbar、TabBar、页面侧栏、PanelCard 页面壳等 L2/L3 组件使用自身稳定规格，业务引用方只能通过 Surface spec 选择 Core 暴露的语义档位。完整规则见 `docs/core-ui-governance.md` 的 Layout 引用契约。
9. **Toolbar 动作统一**：Surface toolbar/action spec 最终只能映射到 Core `ActionGlyph` / `ActionButton` / `action-group`，业务只选动作语义和 icon，不手排动作顺序、分组和分隔线；业务 Surface spec 禁止 `kind: "custom"`，这和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则；详细规则见 `docs/core-toolbar.md`、`docs/reusable-components.md` 的 Toolbar / ActionGlyph 规则和 `docs/core-ui-governance.md`。
10. **Production QC 渲染谨慎迁移**：质检纸、批记录、打印/留档类渲染有版式、字段顺序、审计和归档语义，不能被宽泛 UI codemod 批量替换。需要迁移时单独 review、截图/打印态验收，并保留业务可追溯性。
11. **删除也要同步**：删 L1/L2 时同步删 app route、API route、registry child/resourceKey、docs；跑 `npm run db:seed:resources` 清 stale resource。

## 检查

- 不要每个小改都高频跑完整检查；部署前、一个任务收口、或多文件/大量改动时按风险跑。
- 小任务默认不跑 npm 检查。只改少量局部 TS/TSX、文案、样式或文档时，先靠阅读 diff、类型引用和相关文件自查收口，并在交付里说明“未跑 npm 检查，等待统一验证”。
- 多 agent 并行时，普通执行 agent 不主动跑 `lint` / `typecheck` / `arch:gate` / `build`；只有收口/集成/提交前验证的 agent 统一跑，或用户明确要求当前 agent 验证时才跑。
- 本地重型检查已通过 `scripts/check/with-check-lock.js` 串行限流；看到 `Waiting for project check lock` 就等当前检查结束，不要另开同类 `npm run lint` / `tsc` / `build`。`arch:gate` 同一代码快照通过后会复用缓存结果，不需要手动重复排队。
- 收口验证时按风险选择：架构、权限、registry、API、Core/Platform 基建跑 `npm run arch:gate`。
- 收口验证时按风险选择：普通 TS/TSX 跑 `npm run check:changed`。
- 收口验证时按风险选择：schema、model、migration 跑 `npm run check:data`。
- 收口验证时按风险选择：文档改动跑 `npm run docs:check`。
- PR/CI 收口使用 `npm run check:ci`；`npm run check:full` 只是兼容别名。CI 中 hygiene 只跑 warning，不阻断合并。
- 公司硬编码、baseline 债务、lint/arch 规则漏洞这类细枝末节治理进 `npm run check:hygiene` 和 Hygiene Role；日常提示用 `npm run check:hygiene:warn`，不进 `arch:gate` / `lint:full` 主阻断链路。
- 大规模 UI 迁移前后必须运行或阅读 Core UI governance 检查结果，确认 `businessCoreUiSurfaceBypassImports` 等 baseline 只减少、不扩写；长期迁移按阶段定期复查 gate/report，而不是等收口一次性处理。
- 提交前必须看 `git status --short`，只 stage 本任务文件；不要回滚、格式化或提交别人的改动。
