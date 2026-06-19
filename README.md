# 内部管理系统

## 当前业务模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 人事管理 | `/hr` | 人事基础资料、考勤绩效、人力分析 |
| 财务管理 | `/finance` | 总账基础、财务报表、预算、分析、成本、导入 |
| 行政管理 | `/administration` | 合同台账 |
| 生产管理 | `/production` | 批次检验、检验模板 |
| 外部关系 | `/external` | 客户管理、投资人关系、供应商管理 |
| 文档中心 | `/docs` | 员工手册、操作指南、规章制度 |
| 资料库 | `/library` | 本地文件浏览器，通过 LIBRARY_ROOT 配置根目录 |
| 工作汇报 | `/reports` | 周报、月报、季报、年报 |

## 横向平台能力

| 能力 | 位置 | 说明 |
|------|------|------|
| 认证授权 | `server/auth/`, `lib/auth.ts`, `packages/platform/server/auth.ts` | JWT Cookie + API Key，RBAC 权限；业务包通过 Platform server 契约使用 |
| 通用 UI | `app/components/`, `packages/core/` | AppShell, ModuleHome, UserMenu, Toast, ConfirmModal；通用字段和交互组件逐步下沉到 Core |
| 模块注册 | `packages/platform/`, `packages/<domain>/`, `app/lib/module-nav.tsx` | 业务包导出注册信息，Platform 聚合；`app/lib/module-nav.tsx` 保留兼容出口 |
| 搜索 | `packages/core/search`, `lib/search.ts` 兼容出口 | 拼音搜索、统一搜索匹配能力 |
| 审计 | `packages/platform/server/history.ts`, `lib/history.ts`, `app/components/AuditLogModal.tsx` | 变更历史、版本回溯；业务包通过 Platform server 契约写快照 |
| 智能助手 | `app/components/agent/`, `app/api/agent/`, `server/services/agent/` | 浮窗对话助手，基于当前权限查询数据 |

## 三层五包

| 包 | 定位 | 说明 |
|---|---|---|
| `@workspace/core` | 底座 | 模块契约、未来通用 UI、筛选、表格、表单、日期、FK 搜索、tag 输入 |
| `@workspace/platform` | 主体 | 登录后平台壳、模块聚合、导航、权限资源注册、审计、用户和 Portal |
| `@workspace/hr` | 业务包 | HR 模块注册、后续 HR UI/server/import/types/constants 的归属入口 |
| `@workspace/production` | 业务包 | 生产/QC 模块注册、后续生产 UI/server/import/types/constants 的归属入口 |
| `@workspace/finance` | 业务包 | 财务模块注册、后续财务 UI/server/import/types/constants 的归属入口 |

当前仍是一个 Next.js 应用、一个数据库和一个部署单元。先拆代码边界，不拆 URL、不拆 Prisma client、不改变 CNB 部署流程。详细规则见 `docs/module-boundaries.md`。

## 目录契约

```text
app/<domain>/          # Next 页面路由壳、ARCHITECTURE.md
app/api/<domain>/      # API route 壳（认证、权限、参数校验、调用 package service、返回 DTO）
app/components/        # Core/Platform 兼容 re-export，旧页面过渡使用
app/lib/               # 兼容 re-export 和旧调用
packages/core/         # 底座契约、通用 UI、筛选、表格、日期、搜索、确认弹窗
packages/platform/     # 平台聚合、模块注册、导航入口
packages/<domain>/     # HR、Production、Finance 业务包边界
server/services/<domain>/  # 存量兼容业务服务；新增默认进 packages/<domain>/server
server/auth/           # 认证授权
prisma/                # 数据模型（models/）、迁移、seed
lib/                   # 旧跨端工具和兼容出口；新增按 Core/Platform/Apps 归属
docs/                  # 治理文档
```

## 从数据到页面的标准流程

1. 外部数据（Excel/CSV）→ `prisma/seed-data/`
2. 解析导入 → `packages/<domain>/server` 或 `packages/<domain>/import` → `app/api/<domain>/import/`
3. 事实入库 → `prisma/models/<domain>.prisma`
4. 业务计算 → `packages/<domain>/server/`
5. API 输出 DTO → `app/api/<domain>/`
6. UI 展示 → `packages/<domain>/ui`，由 `app/<domain>/` 路由壳挂载

## 数据原则

- **DB 存事实**：外部系统提供的原始字段、业务主键、`sourceFile/sourceSheet/sourceRow` 追溯字段
- **Service 算结果**：合计、百分比、毛利、单位成本等派生字段不入库
- **不确定的原始行放 `rawPayload`**：不能为了还原 Excel 样子把几十个不稳定列都建成 schema
- **月度余额是计算结果**：从 baseline snapshot + posted vouchers 逐月滚动，不是直接导入

## 权限原则

- 资源树定义在 `lib/permissions.ts`，动作只用 `access/write/delete/admin`
- GET→access, POST/PUT/PATCH→write, DELETE→delete
- 页面按钮隐藏不是安全边界，所有写入/删除必须在 API 层校验
- 页面入口统一使用 `visibleResourceKeys` + `requireResourceAccess(resourceKey)`
- 后台入口使用 `manageableResourceKeys.length > 0`，不是 `system.access`
- ERPNext 有的标准 ERP 功能不在 Workspace 重复建设；Workspace 只管入口、分析、协同和审批写回

## 技术栈

Next.js 16 + React + TypeScript + Tailwind CSS + Prisma + SQLite

## 关键规则

- **新增业务模块必须导出 package registration，并由 `packages/platform/modules.tsx` 聚合**
- 模块首页用 `ModuleHome`，子页面用 `AppShell`
- 详见 `docs/architecture-governance.md`、`docs/module-boundaries.md` 和 `rules.md`
