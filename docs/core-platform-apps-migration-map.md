# Core / Platform / Apps 迁移归属表

这张表是后续 agent 的迁移顺序和归属依据。目标不是只移动 module registration，而是把 UI、server、hooks、types、constants、import 一起迁到目标包；`app/` 和 `app/api/` 只保留 Next route 薄壳。

## 迁移原则

- **Core** 只放通用 UI 与交互基建：下拉、日期、FK 搜索、Tag、确认弹窗、Toast、表格、筛选栏、搜索框、分页、通用布局骨架。
- **Platform** 放平台能力：登录、权限、用户、导航、审计、模块注册、Portal、设置、历史记录、真正跨业务的工作台能力。
- **Apps** 放业务能力：HR、Finance、Production、Work、Administration、Library 等各自拥有 `ui / server / types / constants / import / module`。
- 原 Project / EmployeeProject 业务层归入 Work；不要新增 `packages/project`。DB 表名 `Project` / `EmployeeProject` 暂时保留只是存量 schema 名，不代表业务包归属。
- `app/` 只保留 Next route/API 壳；业务子目录中的历史实现文件债由 `scripts/arch/level15-baseline.json` 锁定，只能减少不能新增。
- 页面源码通过 route groups 收口：`app/(modules)/*` 放业务页面壳，`app/(system)/*` 放平台系统页面壳，`app/(auth)/*` 放登录，`app/(docs)/*` 放文档；URL 仍使用 `/hr`、`/finance`、`/work` 等业务路径。

## 归属表

| 功能 | 目标包 | 当前文件 | 迁移后文件 | app 是否只剩薄壳 | 旧代码是否删除 |
|---|---|---|---|---|---|
| 通用下拉、日期、确认、Toast、表格、筛选、分页、Tag、搜索匹配 | `packages/core` | app 内一次性控件 | `packages/core/ui/*`, `packages/core/hooks/*`, `packages/core/search/*` | route 只挂载包内 UI | 进行中；共享入口已迁入 Core |
| 平台壳、模块首页、导航、用户菜单、Portal、审计 UI、Admin 管理后台、Agent 浮窗 | `packages/platform` | 旧平台页面壳和 Portal | `packages/platform/ui/*`, `packages/platform/ui/admin/*`, `packages/platform/ui/agent/*`, `packages/platform/module-registry.ts`, `packages/platform/modules.tsx`, `packages/platform/audit/*` | `app/(system)/settings/admin/page.tsx`、`app/(system)/portal/page.tsx` 只做鉴权和挂载 | 进行中；Platform UI 仍有 Level 2 页面设计债务 baseline，后续以 Core primitive 收敛 |
| 平台认证、权限、Prisma 入口、CRUD 工厂、历史、FK 解析 | `packages/platform/server` + `packages/platform/permissions.ts` | 旧 `server/auth/*`, `server/rbac/*`, `server/dal/*`, `lib/auth/token.ts`, `lib/history.ts`, `lib/resolve-fk.ts` | `packages/platform/server/*`, `packages/platform/server/auth/*`, `packages/platform/server/rbac/*`, `packages/platform/resources.ts`, `packages/platform/permissions.ts` | 完成：root `server/` 与 root `lib/` 已删除；app/API 统一使用 `@workspace/platform/server/*` | 旧代码已删除；`arch:gate` 禁止恢复 root `server/`、root `lib/` 和旧 alias |
| HR 资料、部门岗位、员工项目、导入、校验、搜索 | `packages/hr` | `app/hr/*`, `app/api/modules/hr/roster/*`, `server/services/hr/*`, `lib/hr-*`, `lib/autocomplete-config.ts` | `packages/hr/ui/*`, `packages/hr/server/*`, `packages/hr/types/*`, `packages/hr/constants/*`, `packages/hr/import/*` | 大部分完成：`app/hr/components`、`app/hr/code/components`、`app/hr/code/hooks`、`app/hr/hooks` 已删除，HR 页面仍有旧 tabs/profile/analytics 待迁 | 进行中；继续把 HR route 下真实页面实现迁到 package |
| Finance 页面模板、筛选、公司期间、分页、表格工具栏、预算、成本、导入面板、重分类 UI | `packages/finance` + `packages/core` | `app/finance/*/components/*`, `server/services/finance*` | `packages/finance/ui/*`, `packages/finance/server/*`, `packages/finance/types/*`, `packages/finance/constants/*`, `packages/finance/import/*` | 基本完成：`app/finance/components`、`app/finance/budget/{components,hooks}`、`app/finance/cost/{components,hooks}` 和 `app/finance/import/components` 已删除，页面壳/筛选/分页/表格/预算/成本/导入/重分类共享 UI 直接从 `@workspace/finance/ui` 消费 | 旧 app 真实实现已删除；后续只允许 route 薄壳 |
| Production / QC 模板、批次、布局、反馈、运行态数据 | `packages/production` | `app/production/*`, `app/api/modules/production/*`, `server/services/production/*` | `packages/production/ui/*`, `packages/production/server/*`, `packages/production/types/*`, `packages/production/constants/*`, `packages/production/import/*` | 进行中：`app/production/qc/components` 已迁入 `packages/production/ui/qc`；QC route 只做鉴权、预取和挂载 package component | UI 迁移完成；后续按 gate 继续收敛 QC 内部重复控件 |
| Work 项目/清单 | `packages/work` | Work 存量 route 与 `server/services/works.ts` | `packages/work/ui/*`, `packages/work/server/*`, `app/(modules)/work/**/page.tsx` 薄壳 | 是 | 是 |
| Settings 设置 | `packages/platform` | 旧 `app/settings/*` | `packages/platform/ui/settings/*`, `app/(system)/settings/**/page.tsx` 薄壳 | 是：page 鉴权后挂载 package component | app 旧 UI / modal re-export 已删除 |
| Docs 静态/平台文档入口 | `packages/platform` | 文档中心存量 route | `packages/platform/ui/docs/*`，`app/(docs)/docs/*` 只保留 route/layout | 基本是 | 顶层独立接入指南 route shell 已删除 |
| Contracts 合同模块 | `packages/administration` | 合同存量 route 与 `app/api/modules/administration/contracts/*` | `packages/administration/ui/*`, `packages/administration/server/*`, `packages/administration/types/*`, `packages/administration/module.ts`, `app/(modules)/administration/contracts/page.tsx` 薄壳 | 是：page/API route 均为薄壳 | app 旧顶层 route 已删除，API 逻辑已下沉 |
| Library 资料库模块 | `packages/library` | 旧 `app/library/*`, `app/api/modules/library/basic-info/*`, `server/services/library/*` | `packages/library/ui/*`, `packages/library/server/*`, `packages/library/types/*`, `packages/library/module.ts`, `app/(modules)/library/page.tsx` 薄壳 | 基本是：page/API route 调 package service | 旧 server service 已移动到包 |
| Administration 行政模块 | `packages/administration` | `app/(modules)/administration/*` | `packages/administration/ui/*`, `packages/administration/server/*`, `packages/administration/module.ts` | 合同页已完成；行政首页待薄壳化 | 合同顶层 route 已收口 |
| External 外部关系 | `packages/external` | `app/external/types.ts`, `app/external/*/*Client.tsx` | `packages/external/types/*`, `packages/external/ui/*`, `packages/external/module.ts` | 是：外部关系子页只做鉴权、AppShell 和挂载 package component | 类型与占位 UI 旧代码已删除 |
| Inventory 库存旧入口 | 无独立包；归入 Production 后续范围 | 无运行 UI | 后续若恢复库存能力，应放入 `packages/production` 或明确新业务包 | 是：无真实 page shell | 顶层 route 已删除 |
| Agent 工具与模型接入 | `packages/platform` 或后续独立 `packages/agent` | `server/services/agent/*` | 若作为平台助手：`packages/platform/server/agent/*`；若独立模块：`packages/agent/*` | 未完成 | 未完成 |

## 当前优先级

1. **Production / QC**：继续按 gate 结果收敛 `packages/production/ui/qc` 内部重复控件，尤其纸面输入、模板反馈弹窗和 QC 表格 primitive。
2. **Work 业务包**：旧 `reports`、`history` 已废弃；项目相关体验仍由 Work/Feature 线程继续收口。
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
npm run lint -- --max-warnings=0
npm run typecheck:quick
npm run build
```
