# Admin 管理后台模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 管理后台 | `/settings/admin` | `app/(system)/settings/admin/page.tsx` → `AdminClient.tsx` |

## 页面结构

AdminClient 渲染管理入口：

| Tab | 组件 | 说明 |
|-----|------|------|
| 权限管理 | PermissionsTab / SpacePermissionsTab | 子 tab 为员工、岗位、部门、空间；前三者是资源授权矩阵，空间是个人/部门/公司空间授权入口 |
| 模块管理 | ModuleManagementTab | 系统管理员维护模块启停 |

## 核心组件链

```
page.tsx
  └─ AdminClient.tsx
       ├─ PermissionsTab              — 员工/岗位/部门资源授权
       ├─ SpacePermissionsTab         — 权限管理下的空间子 tab
       └─ ModuleManagementTab
```

## 数据流

1. **AdminClient** 进入员工/岗位/部门权限时加载权限资源树 `/api/settings/admin/permissions`
2. **PermissionsTab** 按 `subjectType`（user/position/department）切换，加载对应授权数据
3. **SpacePermissionsTab** 按空间主体（个人/常用部门/公司）选择任务、项目、模板入口；已接入的入口调用对应模块 API
4. **API 路由** 在 `app/api/settings/admin/` 下，分功能子目录（permissions、permission-grants、users 等）；空间权限保存由各业务空间 API 自己验权

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
- `/settings/admin` 页面入口只要求登录；后台资源权限 API 和空间权限 API 分别做最终授权校验
- `manageableResourceKeys` — 进入后台后的实际可管理范围
- 仅内置 `admin` root 账号 — 可见模块管理和系统配置
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
