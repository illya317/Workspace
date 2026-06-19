# Core / Platform / Apps 迁移归属表

这张表是后续 agent 的迁移顺序和归属依据。目标不是只移动 module registration，而是把 UI、server、hooks、types、constants、import 一起迁到目标包；`app/` 和 `app/api/` 只保留 Next route 薄壳。

## 迁移原则

- **Core** 只放通用 UI 与交互基建：下拉、日期、FK 搜索、Tag、确认弹窗、Toast、表格、筛选栏、搜索框、分页、通用布局骨架。
- **Platform** 放平台能力：登录、权限、用户、导航、审计、模块注册、Portal、设置、历史记录、真正跨业务的工作台能力。
- **Apps** 放业务能力：HR、Finance、Production、Work、Administration、Library 等各自拥有 `ui / server / types / constants / import / module`。
- 原 Project / EmployeeProject 业务层归入 Work；不要新增 `packages/project`。DB 表名 `Project` / `EmployeeProject` 暂时保留只是存量 schema 名，不代表业务包归属。
- 旧 `app/components`、`app/hooks`、`lib`、`server/services` 只能保留兼容 re-export 或 Next 必须入口；真实逻辑必须逐步下沉。

## 归属表

| 功能 | 目标包 | 当前文件 | 迁移后文件 | app 是否只剩薄壳 | 旧代码是否删除 |
|---|---|---|---|---|---|
| 通用下拉、日期、确认、Toast、表格、筛选、分页、Tag、搜索匹配 | `packages/core` | `app/components/*`, `app/hooks/useToast.ts`, app 内一次性控件 | `packages/core/ui/*`, `packages/core/hooks/*`, `packages/core/search/*` | 部分完成：`app/components` 仍有兼容壳和少量真实实现 | 进行中；旧 `SearchBox/useSearch` 已删除并被 `arch:gate` 禁止复活 |
| 平台壳、模块首页、导航、用户菜单、Portal、审计 UI | `packages/platform` | `app/components/AppShell.tsx`, `ModuleHome.tsx`, `NavLink.tsx`, `UserMenu.tsx`, `AuditLog*`, `app/portal/*` | `packages/platform/ui/*`, `packages/platform/module-registry.ts`, `packages/platform/modules.tsx`, `packages/platform/audit/*` | 部分完成：app 层仍大量通过兼容壳引用 | 未完成；应逐页改为 `@workspace/platform/ui` |
| 平台认证、权限、Prisma 入口、CRUD 工厂、历史、FK 解析 | `packages/platform/server` | `lib/auth.ts`, `lib/permissions.ts`, `lib/prisma.ts`, `lib/crud-factory.ts`, `lib/history.ts`, `lib/resolve-fk.ts` | `packages/platform/server/*`, `packages/platform/resources.ts` | 部分完成：`lib` 仍承载兼容与部分真实逻辑 | 未完成；迁移后 `lib` 只保留 re-export 或 Next 必需工具 |
| HR 资料、部门岗位、员工项目、导入、校验、搜索 | `packages/hr` | `app/hr/*`, `app/api/hr/*`, `server/services/hr/*`, `lib/hr-*`, `lib/autocomplete-config.ts` | `packages/hr/ui/*`, `packages/hr/server/*`, `packages/hr/types/*`, `packages/hr/constants/*`, `packages/hr/import/*` | 大部分完成：HR 页面仍有旧薄壳和少量 app 组件引用 | 进行中；需继续删除旧 app HR 真实实现 |
| Finance 页面模板、筛选、公司期间、分页、表格工具栏、导入面板、重分类 UI | `packages/finance` + `packages/core` | `app/finance/components/*`, `app/finance/*/components/*`, `server/services/finance*` | `packages/finance/ui/*`, `packages/finance/server/*`, `packages/finance/types/*`, `packages/finance/constants/*`, `packages/finance/import/*` | 半完成：`FinanceShell/FinanceFilters/CompanyPeriodPicker/Pagination/ReclassConfig*` 已下沉，仍有多处旧路径和真实组件 | 未完成；下一组优先迁移 |
| Production / QC 模板、批次、布局、反馈、运行态数据 | `packages/production` | `app/production/*`, `app/api/production/*`, `server/services/production/*` | `packages/production/ui/*`, `packages/production/server/*`, `packages/production/types/*`, `packages/production/constants/*`, `packages/production/import/*` | 未完成：当前主要仍在 app/server | 未完成 |
| Reports 工作汇报 | `packages/work` | `app/reports/*`, `server/services/reports.ts` | `packages/work/ui/reports/*`, `packages/work/server/reports/*`, `packages/work/types/reports.ts` | 未完成 | 未完成 |
| Works 工作清单 | `packages/work` | `app/works/*`, `server/services/works.ts` | `packages/work/ui/works/*`, `packages/work/server/works/*`, `packages/work/types/works.ts` | 未完成 | 未完成 |
| Settings 设置 | `packages/platform` | `app/settings/*` | `packages/platform/ui/settings/*`, `packages/platform/server/settings/*` | 是：page 鉴权后挂载 package component | app 旧 UI 已改兼容 re-export |
| History 历史记录 | `packages/work` | `app/history/*`, `lib/history.ts` | `packages/work/ui/history/*`, `packages/work/server/history.ts` | 未完成 | 未完成 |
| Docs 静态/平台文档入口 | `packages/platform` | `app/docs/*` | `packages/platform/ui/docs/*`，`app/docs/*` 只保留 route/layout | 未完成 | 未完成 |
| Contracts 合同模块 | `packages/administration` | `app/contracts/*`, `app/api/contracts/*` | `packages/administration/ui/*`, `packages/administration/server/*`, `packages/administration/types/*`, `packages/administration/module.ts` | 是：page/API route 均为薄壳 | app 旧 UI 已移动，API 逻辑已下沉 |
| Library 资料库模块 | `packages/library` | `app/library/*`, `app/api/library/*`, `server/services/library/*` | `packages/library/ui/*`, `packages/library/server/*`, `packages/library/types/*`, `packages/library/module.ts` | 基本是：page/API route 调 package service | 旧 server service 已移动到包 |
| Administration 行政模块 | `packages/administration` | `app/administration/*`, `app/contracts/*` | `packages/administration/ui/*`, `packages/administration/server/*`, `packages/administration/module.ts` | 合同页已完成；行政首页待薄壳化 | 合同旧代码已收口 |
| Inventory 库存模块 | `packages/inventory` | `app/inventory/*`, `app/api/inventory/*`, `lib/crud-inventory.ts` | `packages/inventory/ui/*`, `packages/inventory/server/*`, `packages/inventory/module.ts` | 未完成 | 未完成 |
| Agent 工具与模型接入 | `packages/platform` 或后续独立 `packages/agent` | `server/services/agent/*` | 若作为平台助手：`packages/platform/server/agent/*`；若独立模块：`packages/agent/*` | 未完成 | 未完成 |

## 当前优先级

1. **Finance**：继续下沉真实 UI 与服务，统一页面模板、筛选栏、表格、分页、弹窗、导入面板，减少 `app/finance/components` 真实实现。
2. **Work 业务包**：由并行线程承接 Project / EmployeeProject / reports / works / history；本线程只把它纳入边界表和硬约束，不改 Work 具体实现。
3. **Platform 平台能力**：迁移 settings / docs 和平台壳，避免只注册模块但 UI/server 仍留在 app/server。
4. **Contracts / Library 独立包**：不要塞进 Platform；按业务包拆 `ui/server/types/module`。
5. **硬约束升级**：`arch:gate` 已扩大检查范围，禁止业务包之间直接 import，禁止非 Core 包新增未基于 Core/Platform 的疑似基础组件。Work 的临时搜索组件在 allowlist 中记录为并行拆分债务。

## 验收证据

每完成一组迁移，需要在本表中更新：

- `迁移后文件`
- `app 是否只剩薄壳`
- `旧代码是否删除`

并运行：

```bash
npm run arch:gate
npm run size:check
npm run lint -- --max-warnings=0
npm run typecheck:quick
npm run build
```
