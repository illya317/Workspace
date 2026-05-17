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

## 数据库模型（24 张表，详见 `docs/tables.md`）

| 模块 | 模型 | 说明 |
|------|------|------|
| 用户 | `User` | 系统登录用户，保留旧 boolean 权限字段过渡 |
| 周报 | `ReportGroup`, `WeeklyReport`, `ReportItem`, `ReportHistory` | 周报填报、版本快照 |
| 周报成员 | `ReportGroupAdmin/Member/Viewer` (旧), `ReportGroupMembership` (新) | 分组权限，旧三表逐步迁移到 Membership |
| 工作 | `WorkItem`, `WorkParticipant` | 部门工作清单 |
| 员工 | `Employee` | 花名册，editedBy/editedAt/version 追踪 |
| 组织 | `Department`, `Position`, `EmployeePosition`, `DepartmentPosition` | 部门岗位体系 |
| 权限 | `PermissionCategory`, `Permission`, `UserPermission` | 权限注册表，新增权限只需 INSERT |
| 权限 | `DepartmentAdmin`, `FieldPermission`, `GlobalFieldPermission` | 部门管理/字段级权限 |
| 字典 | `CompanyCode` | 公司编码 |
| 历史 | `EditHistory` | 通用编辑快照（Employee/EmployeePosition/Department/Position） |

**关联**: `Employee.userId` → `User.id`（单向，通过姓名初始化匹配）

## 关键路由

| 页面 | 路径 | 权限 |
|------|------|------|
| 登录 | `/login` | 公开 |
| 入口 | `/portal` | 登录 |
| 填写周报 | `/dashboard` | 登录 |
| 历史记录 | `/history` | 登录 |
| 工作清单 | `/works` | 登录 |
| 人事行政 | `/hr` | `canAccessHR` |
| 管理后台 | `/admin` | `isWorkListAdmin` 或 `system.admin` 权限 |
| API接入 | `/api-guide` | 登录 |
| 设置 | `/settings` | 登录 |

| API | 路径 | 说明 |
|-----|------|------|
| 花名册 | `GET /api/employees` | 列表+导出，按权限过滤字段 |
| 花名册更新 | `PUT /api/employees/[id]` | 单字段更新，自动 EditHistory 快照 |
| 联想 | `GET /api/employees/autocomplete` | 部门/人员联想 |
| 员工岗位 | `GET/PUT/DELETE /api/employee-positions` | 岗位关联管理 |
| 员工权限 | `GET/PUT /api/admin/employee-permissions` | 花名册+权限合并管理 |
| 用户权限 | `PUT /api/admin/user-permissions` | 单个用户权限授予/撤销 |
| 权限定义 | `GET /api/admin/permissions` | 动态权限注册表 |
| 编辑历史 | `GET /api/admin/edit-history` | 浏览/恢复数据版本 |
| 字段权限 | `GET/PUT/DELETE /api/field-permissions` | 字段级例外规则 |
| 个人API | `GET/POST /api/my-api-key` | 申请/查看个人API Key |
| 编码管理 | `GET/PUT/DELETE /api/admin/department-codes` | 部门编码 |
| 编码管理 | `GET/PUT/DELETE /api/admin/position-codes` | 岗位编码 |

## 认证方式

1. **网页版**: Cookie JWT (`token`)
2. **API接入**: `X-API-Key`(个人) + `X-Username` + `X-Password`
3. **权限校验**: `lib/auth.ts` — `authenticate()`, `requireAdmin()`, `isAdmin()`, `checkPermission()`, `isGroupAdmin()` 等

## 共享模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `EditToolbar` | `app/components/EditToolbar.tsx` | 编辑→保存+取消+版本 工具栏 |
| `ConfirmModal` | `app/components/ConfirmModal.tsx` | 统一确认弹框 |
| `Toast` | `app/components/Toast.tsx` | 统一通知提示 |
| `useToast` | `app/hooks/useToast.ts` | Toast hook（showToast/closeToast） |
| `FilterBar` | `app/components/FilterBar.tsx` | 筛选工具栏容器 |
| `company` | `lib/company.ts` | 公司常量和辅助函数 |
| `search` | `lib/search.ts` | 拼音搜索（matchEmployee/getInitials） |

**规范**：
- 确认弹框统一用 `<ConfirmModal>`，禁止 `window.confirm`
- 通知统一用 `useToast()`，禁止裸 `setTimeout` 管理提示
- 公司名/编码统一从 `lib/company` 导入，禁止硬编码
- API 鉴权统一用 `lib/auth.ts` 的 `authenticate` / `isAdmin`，禁止本地定义 `requireAdmin`

## 部署流程

```bash
./deploy.sh              # 普通部署（只同步代码）
./deploy.sh --push-db    # schema 变更时使用（拉服务器DB→本地push→推回）
```

部署时自动：构建 → 复制 static/public → rsync 到服务器 → 修复 .env → pm2 restart

## 花名册数据

- Excel: `/Users/koito/Desktop/Project/HR/data/合并花名册.xlsx`
- 公司名清洗: `制药` → `丰华制药`, `江苏制药` → `丰华制药`, 其他保持原名
- 丰华生物组: 丰华生物 + 丰华天力通 + 丰华悦通 + 加拿大（共享数据）
- `import-users.ts` 脚本只处理 User 表，Employee/EmployeePosition 需另行同步
