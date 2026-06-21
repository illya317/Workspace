# Admin 管理后台模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 管理后台 | `/settings/admin` | `app/(system)/settings/admin/page.tsx` → `AdminClient.tsx` |

## 页面结构

AdminClient 渲染两个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 用户账号 | AdminUsersTab | 用户列表、重置密码、角色管理 |
| 权限管理 | PermissionsTab | 统一权限矩阵（员工/岗位/部门） |

## 核心组件链

```
page.tsx
  └─ AdminClient.tsx
       ├─ AdminUsersTab        — 用户管理
       └─ PermissionsTab
            ├─ usePermissionsTab.ts   — 权限数据加载/筛选/排序
            └─ PermissionDrilldown.tsx — 权限来源详情弹窗
```

## 数据流

1. **AdminClient** 加载权限资源树 `/api/system/admin/permissions`
2. **PermissionsTab** 按 `subjectType`（user/position/department）切换，加载对应授权数据
3. **API 路由** 在 `app/api/system/admin/` 下，分功能子目录（permissions、permission-grants、users 等）

## API 规范

Admin API 在 `app/api/system/admin/` 下：

| 端点 | 说明 |
|------|------|
| `/api/system/admin/permissions` | 权限资源树 |
| `/api/system/admin/permission-grants` | 统一授权设置 |
| `/api/system/admin/user-permissions` | 用户权限切换 |
| `/api/system/admin/position-permissions` | 岗位权限切换 |
| `/api/system/admin/department-permissions` | 部门权限切换 |
| `/api/system/admin/users` | 用户列表/更新 |
| `/api/system/admin/audit-log` | 审计日志查询 |
| `/api/system/admin/edit-history` | 编辑历史查询 |
| `/api/system/admin/system-config` | 系统配置（冲突策略） |

## 权限标准

- `system.admin` — 系统管理员，拥有全部权限
- `people.access` — 可进入管理后台（用户账号 Tab 可见性）
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
