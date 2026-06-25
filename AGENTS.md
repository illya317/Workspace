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

常用专题：

| 主题 | 文档 |
|---|---|
| 开工流程和任务分流 | `docs/agent-startup.md` |
| Core/Platform 基础设施 | `docs/reusable-components.md` |
| Core UI 五层治理 | `docs/core-ui-governance.md` |
| 架构边界和权限四件套 | `docs/architecture-governance.md` |
| Work 模块长期边界/权限 | `app/(modules)/work/MODULE.md` |
| Work 模块短期计划 | `app/(modules)/work/PLAN.md` |
| RBAC/默认权限/Open API | `docs/security/rbac.md`, `docs/security/permission-matrix.md` |
| 新模块 | `docs/new-module-checklist.md` |
| 现有模块新增能力 | `docs/existing-module-feature-checklist.md` |

## 项目硬规则

1. **三层边界**：Core 不依赖 Platform/Apps；Platform 不写业务 service/UI；业务包之间不直接 import。跨模块能力进 Platform contract。
2. **别重复造基础设施**：Core/Platform 已有页面壳、表格、筛选、搜索、日期、确认、Toast、FK、权限、CRUD factory、delete guard、审计、模块 registry。新增前先查 `docs/reusable-components.md` 和 `packages/core/ui/component-registry.ts`。
3. **Core UI 只走五层治理**：业务和普通 agent 只能直接使用 `Page API`，以及明确 `stable` 的 `Page Frame`。不得直接 import `Core Internal`、`Foundation`、`Private Impl`；不得新增业务包 Toolbar/Picker/Table/Modal/Date/Search 等重复基础 UI。改 `packages/core/ui/**`、Core UI registry 或 `/settings/ui` preview 必须是 UI-system/Architecture 任务，并用 `CORE_UI_CHANGE=1` 明确授权。完整规则见 `docs/core-ui-governance.md`。
4. **权限四件套统一**：每个 L2 必须保持 `app route` / `URL href` / `resourceKey + RBAC` / `API contract + guard` 一一对应。页面用 `requireRouteAccess("<href>")`，API 用 `requireApiAccess(request)` 或接入它的 wrapper，从 registry 推导 resource/action。
   新增、改名或删除 `moduleDef.resourceKey`、`children[*].resourceKey` 或 `resourceDefs` 后，必须运行 `npm run db:seed:resources` 同步 DB `Resource` 表；这不是 Prisma schema 迁移，除非数据模型变了，不要为每个资源注册改 migration。
5. **写入三段式**：写入入口固定为 `Zod schema -> domain validator -> service/Prisma`。Zod 只校验请求形状并 strip；domain 只 pick 业务可写字段并校验 FK/状态/归属/跨字段规则；service 只接已验证 command，负责事务、版本、审计和落库。
6. **app 不是实现层**：页面组件、hook、表格、弹窗、业务计算、Prisma 写入都不能新增在 `app/` route 文件里。
7. **同页状态别走整页导航**：tab、筛选、选中部门/项目/记录这类同一个客户端体验内的状态切换，不要用 `router.push/replace`、`redirect` 或 `<Link>` 只为同步 URL；需要深链时用组件状态 + `window.history.pushState/replaceState`，并通过 `workspacePath` 处理 basePath、补 `popstate` 回读。`router` / `<Link>` 只留给真正跨页面或资源详情导航。
8. **Toolbar 动作统一**：Toolbar 动作按钮只能来自 Core `ActionGlyph` / `ActionButton` / `action-group`，业务只选 icon，不手排动作顺序、分组和分隔线；详细规则见 `docs/reusable-components.md` 的 Toolbar / ActionGlyph 规则。
9. **删除也要同步**：删 L1/L2 时同步删 app route、API route、registry child/resourceKey、docs；跑 `npm run db:seed:resources` 清 stale resource。

## 检查

- 不要每个小改都高频跑完整检查；部署前、一个任务收口、或多文件/大量改动时按风险跑。
- 小任务默认不跑 npm 检查。只改少量局部 TS/TSX、文案、样式或文档时，先靠阅读 diff、类型引用和相关文件自查收口，并在交付里说明“未跑 npm 检查，等待统一验证”。
- 多 agent 并行时，普通执行 agent 不主动跑 `lint` / `typecheck` / `arch:gate` / `build`；只有收口/集成/提交前验证的 agent 统一跑，或用户明确要求当前 agent 验证时才跑。
- 本地重型检查已通过 `scripts/check/with-check-lock.js` 串行限流；看到 `Waiting for project check lock` 就等当前检查结束，不要另开同类 `npm run lint` / `tsc` / `build`。
- 收口验证时按风险选择：架构、权限、registry、API、Core/Platform 基建跑 `npm run arch:gate`。
- 收口验证时按风险选择：普通 TS/TSX 跑 `npm run lint:changed` 和 `npm run typecheck:quick`。
- 收口验证时按风险选择：文档改动跑 `npm run docs:check`。
- 提交前必须看 `git status --short`，只 stage 本任务文件；不要回滚、格式化或提交别人的改动。
