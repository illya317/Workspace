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

1. **AdminClient** 加载权限资源树 `/api/settings/admin/permissions`
2. **PermissionsTab** 按 `subjectType`（user/position/department）切换，加载对应授权数据
3. **API 路由** 在 `app/api/settings/admin/` 下，分功能子目录（permissions、permission-grants、users 等）

## API 规范

Admin API 在 `app/api/settings/admin/` 下：

| 端点 | 说明 |
|------|------|
| `/api/settings/admin/permissions` | 权限资源树 |
| `/api/settings/admin/permission-grants` | 统一授权设置 |
| `/api/settings/admin/user-permissions` | 用户权限切换 |
| `/api/settings/admin/position-permissions` | 岗位权限切换 |
| `/api/settings/admin/department-permissions` | 部门权限切换 |
| `/api/settings/admin/users` | 用户列表/更新 |
| `/api/settings/admin/system-config` | 系统配置（冲突策略） |

## 权限标准

- 内置 `admin` root 账号 — 拥有全部权限，不属于 RBAC resource
- 可管理任一资源（拥有任意资源的 `admin` 角色）— 可进入管理后台并管理自己负责范围内的权限
- 仅内置 `admin` root 账号 — 可见用户账号、模块管理和系统配置
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
