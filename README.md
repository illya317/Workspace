# 内部管理系统

## 当前业务模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 人事管理 | `/hr` | 人事基础资料、考勤绩效、人力分析 |
| 财务管理 | `/finance` | 总账基础、财务报表、预算、分析、成本、导入 |
| 行政管理 | `/administration` | 合同台账 |
| 生产管理 | `/production` | 库存管理 |
| 文档中心 | `/docs` | 员工手册、操作指南、规章制度 |
| 工作汇报 | `/reports` | 周报、月报、季报、年报 |

## 横向平台能力

| 能力 | 位置 | 说明 |
|------|------|------|
| 认证授权 | `server/auth/`, `lib/auth.ts` | JWT Cookie + API Key，RBAC 权限 |
| 通用 UI | `app/components/` | AppShell, ModuleHome, UserMenu, Toast, ConfirmModal |
| 菜单注册 | `app/lib/module-nav.tsx` | 全站模块注册表，单一真相来源 |
| 搜索 | `lib/search.ts`, `app/components/SearchBox.tsx` | 拼音搜索、统一搜索框 |
| 审计 | `lib/history.ts`, `app/components/AuditLogModal.tsx` | 变更历史、版本回溯 |

## 目录契约

```text
app/<domain>/          # 业务页面、组件、hooks、types、ARCHITECTURE.md
app/api/<domain>/      # API route handler（认证、权限、参数校验、调用 service、返回 DTO）
app/components/        # 全站复用 UI
app/lib/               # 应用级工具
server/services/<domain>/  # 业务逻辑（查询、导入、计算、聚合）
server/auth/           # 认证授权
prisma/                # 数据模型（models/）、迁移、seed
lib/                   # 跨端工具（类型、常量、Prisma client）
docs/                  # 治理文档
```

## 从数据到页面的标准流程

1. 外部数据（Excel/CSV）→ `prisma/seed-data/`
2. 解析导入 → `server/services/<domain>/import.ts` → `app/api/<domain>/import/`
3. 事实入库 → `prisma/models/<domain>.prisma`
4. 业务计算 → `server/services/<domain>/`
5. API 输出 DTO → `app/api/<domain>/`
6. UI 展示 → `app/<domain>/`

## 数据原则

- **DB 存事实**：外部系统提供的原始字段、业务主键、`sourceFile/sourceSheet/sourceRow` 追溯字段
- **Service 算结果**：合计、百分比、毛利、单位成本等派生字段不入库
- **不确定的原始行放 `rawPayload`**：不能为了还原 Excel 样子把几十个不稳定列都建成 schema
- **月度余额是计算结果**：从 baseline snapshot + posted vouchers 逐月滚动，不是直接导入

## 权限原则

- 资源树定义在 `lib/permissions.ts`，动作只用 `access/write/delete/admin`
- GET→access, POST/PUT/PATCH→write, DELETE→delete
- 页面按钮隐藏不是安全边界，所有写入/删除必须在 API 层校验
- `SessionUser` 布尔字段（`canAccessHR` 等）由 `server/auth/session.ts` 统一计算
- 模块注册在 `app/lib/module-nav.tsx`，`requiredPerm` 字段控制可见性

## 技术栈

Next.js 16 + React + TypeScript + Tailwind CSS + Prisma + SQLite

## 关键规则

- **新增业务模块必须注册到 `app/lib/module-nav.tsx`**
- 模块首页用 `ModuleHome`，子页面用 `AppShell`
- 详见 `docs/architecture-governance.md` 和 `rules.md`
