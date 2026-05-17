<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# HR 项目架构

## 技术栈

- **框架**: Next.js 16 + React + TypeScript + Tailwind CSS
- **数据库**: Prisma ORM + SQLite (`prisma/dev.db`)
- **认证**: JWT Cookie + API Key (个人)
- **部署**: 本地 `npm run build` → standalone → rsync 到服务器 → PM2 (`weekly`)
- **Excel**: `xlsx` 库读写

## 数据库模型（22 张表，详见 `docs/tables.md`，权限模型详见 `docs/rbac.md`）

| 模块 | 模型 | 说明 |
|------|------|------|
| 用户 | `User` | 纯认证实体，无业务字段 |
| 周报 | `ReportGroup`, `Report`, `ReportItem`, `ReportHistory` | 报告分组+填报+条目+版本快照 |
| 工作 | `WorkItem`, `WorkParticipant` | 独立模块，targetType/targetId 多态归属 |
| 员工 | `Employee` | 花名册 |
| 组织 | `Department`, `Position`, `EmployeePosition`, `DepartmentPosition` | 部门岗位体系 |
| 项目 | `Project`, `EmployeeProject` | 项目/部门分组，人员分配 |
| RBAC | `Resource`, `Role`, `UserResourceRole`, `PositionResourceRole`, `DepartmentResourceRole` | 5 表权限系统 |
| 公司 | `Company` | 公司编码+名称 |
| 历史 | `EditHistory` | 通用编辑快照 |

**已删除**：`PermissionCategory`, `Permission`, `UserPermission`, `DepartmentAdmin`, `FieldPermission`, `GlobalFieldPermission`, `ReportGroupAdmin`, `ReportGroupMember`, `ReportGroupViewer`, `ReportGroupMembership`

**关联**: `Employee.userId` → `User.id`（可选，单向）

## 核心模块维度对比

| 维度 | HR 模块（花名册） | 周报模块 |
|------|------------------|---------|
| **核心实体** | `Employee`（雇佣关系） | `User`（系统账号） |
| **生命周期** | 入职 → 调岗 → 离职 | 注册 → 活跃 → 停用 |
| **数据归属** | 公司资产（人事档案） | 业务资产（工作记录） |
| **权限逻辑** | 谁能看/改**哪个人**的资料 | 谁能看/填**哪个分组**的周报 |
| **时间维度** | 强（`startDate`/`endDate`/`joinDate`/`leaveDate`） | `date` 字段，周期类型由 ReportGroup.periodType 决定 |
| **版本追踪** | `EditHistory`（字段级快照） | `ReportHistory`（整份周报快照） |
| **多人协作** | 无（独占编辑） | 有（同组共享周报） |

### User 与 Employee 边界

```
User（纯认证实体）               Employee（纯业务实体）
─────────────────                ──────────────────
wxUserId                         employeeId（权威业务编号）
username（用户自取，非业务标识）    name（档案名，权威来源）
password                         公司/部门（通过 EmployeePosition）
name（登录显示名）                 position/status
apiKey                           joinDate/leaveDate
canLogin（离职=停用，不删号）       startDate/endDate

          Employee.userId → User.id（可选，0或1对1）
```

**规则**：
- `User` 不存任何业务字段，权限走 `UserResourceRole`
- 查"某用户在哪个部门" → `Employee.userId → EmployeePosition`
- 周报成员用 `User.id`（需登录），HR 操作对象是 `Employee.id`

## 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 填写周报 | `/reports` | 登录 |
| 历史记录 | `/history` | 登录 |
| 工作清单 | `/works` | 登录 |
| 人事行政 | `/hr` | `module.hr.access` |
| 管理后台 | `/admin` | `system.access` |
| API接入 | `/api-guide` | 登录 |
| 设置 | `/settings` | 登录 |

| API | 路径 | 说明 |
|-----|------|------|
| 花名册 | `GET /api/employees` | 列表+导出 |
| 花名册更新 | `PUT /api/employees/[id]` | 单字段更新，自动 EditHistory 快照 |
| 联想 | `GET /api/employees/autocomplete` | 部门/人员联想 |
| 员工岗位 | `GET/PUT/DELETE /api/employee-positions` | 岗位关联管理 |
| 员工权限 | `GET/PUT /api/admin/employee-permissions` | 花名册+权限合并管理 |
| 用户权限 | `PUT /api/admin/user-permissions` | 单个用户权限授予/撤销 |
| 权限定义 | `GET /api/admin/permissions` | 返回 resources + roles |
| 编辑历史 | `GET /api/admin/edit-history` | 浏览/恢复数据版本 |
| 部门管理员 | `GET/PUT/DELETE /api/admin/department-admins` | 部门管理员（UserResourceRole） |
| 个人API | `GET/POST /api/my-api-key` | 申请/查看个人API Key |
| 编码管理 | `GET/PUT/DELETE /api/admin/department-codes` | 部门编码 |
| 编码管理 | `GET/PUT/DELETE /api/admin/position-codes` | 岗位编码 |

## 认证方式

1. **网页版**: Cookie JWT (`token`)
2. **API接入**: `X-API-Key`(个人) + `X-Username` + `X-Password`
3. **权限校验**: `lib/auth.ts` — `authenticate()`, `isAdmin()`, `checkPermission()`, `isGroupAdmin()` 等，全部基于 `UserResourceRole`

## 共享模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `EditToolbar` | `app/components/EditToolbar.tsx` | 编辑→保存+取消+版本 工具栏 |
| `ConfirmModal` | `app/components/ConfirmModal.tsx` | 统一确认弹框 |
| `Toast` | `app/components/Toast.tsx` | 统一通知提示 |
| `useToast` | `app/hooks/useToast.ts` | Toast hook |
| `FilterBar` | `app/components/FilterBar.tsx` | 筛选工具栏容器 |
| `company` | `lib/company.ts` | 公司常量和辅助函数 |
| `search` | `lib/search.ts` | 拼音搜索 |

**规范**：
- 确认弹框 → `<ConfirmModal>`，禁止 `window.confirm`
- 通知 → `useToast()`，禁止裸 `setTimeout`
- 公司名/编码 → `lib/company` 导入，禁止硬编码
- API 鉴权 → `lib/auth.ts`，禁止本地定义 `requireAdmin`
- 表格编辑 → `<EditToolbar>`，统一 保存/取消/版本 交互

## 部署流程

```bash
./deploy.sh              # 普通部署（只同步代码）
./deploy.sh --push-db    # schema 变更时使用（拉服务器DB→本地push→推回）
```

## 花名册数据

- Excel: `/Users/koito/Desktop/Project/HR/data/合并花名册.xlsx`
- 公司名清洗: `制药` → `丰华制药`, `江苏制药` → `丰华制药`
- 丰华生物组: 丰华生物 + 丰华天力通 + 丰华悦通 + 加拿大（共享数据）
