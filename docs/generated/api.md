# HR API Reference

手写摘要；完整自动清单见 `docs/generated/api.html`。

## 认证与账户

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **POST** | `/api/settings/account/password` | 登录 | 修改密码 |
| **DELETE** | `/api/auth/dev-login` | 公开 | 退出登录 |
| **POST** | `/api/auth/dev-login` | 公开 | 开发环境登录 |
| **GET** | `/api/auth/me` | 登录 | 获取当前登录用户信息 |
| **GET** | `/api/settings/account/routine` | 登录 | 获取用户日常模板 |
| **PUT** | `/api/settings/account/routine` | 登录 | 更新用户日常模板 |

## Open API

外部调用使用 `Authorization: Bearer <OpenApiClient secret>`，授权来自 `OpenApiScope`，不复用内部 RBAC `Resource`。

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| **GET** | `/api/open/v1/hr/generated/roster` | `hr.generated.roster.read` | 读取 HR 生成资料花名册 |

## 花名册与组织架构（Canonical）

新代码请统一使用 `/api/modules/hr/roster/*` 入口。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/modules/hr/roster` | 登录 + HR权限 | 花名册（含岗位信息扁平化、Excel导出） |
| **GET** | `/api/modules/hr/roster/employees` | 登录 + HR权限 | 员工列表（分页） |
| **GET** | `/api/modules/hr/roster/employees/search` | 登录 + 系统管理员 | 员工搜索（姓名/工号/拼音） |
| **PUT** | `/api/modules/hr/roster/employees/:id` | 登录 + HR权限 | 更新员工基础信息 |
| **GET** | `/api/modules/hr/roster/autocomplete` | 登录 + HR权限 | 通用自动补全（部门/岗位/员工/项目） |
| **GET** | `/api/modules/hr/roster/positions` | 登录 + HR权限 | 岗位列表（分页） |
| **POST** | `/api/modules/hr/roster/positions` | 登录 + HR写权限 | 创建岗位 |
| **PUT** | `/api/modules/hr/roster/positions/:id` | 登录 + HR写权限 | 更新岗位 |
| **DELETE** | `/api/modules/hr/roster/positions/:id` | 登录 + HR删权限 | 删除岗位 |
| **GET** | `/api/modules/hr/roster/edps` | 登录 + HR权限 | 员工-部门-岗位关联列表 |
| **GET** | `/api/modules/hr/roster/departments` | 登录 + 系统管理员 | 部门列表 |
| **POST** | `/api/modules/hr/roster/departments` | 登录 + 系统管理员 | 创建部门 |
| **PUT** | `/api/modules/hr/roster/departments/:id` | 登录 + 系统管理员 | 更新部门 |
| **DELETE** | `/api/modules/hr/roster/departments/:id` | 登录 + 系统管理员 | 删除部门 |
## 花名册与组织架构（兼容层，已废弃）

以下入口仍保留纯代理，供旧调用方过渡，**新代码禁止直接使用**。

| Method | Path | 代理目标 |
|--------|------|----------|
| **GET** | `/api/modules/hr/roster` | `/api/modules/hr/roster` |
| **GET** | `/api/modules/hr/roster/employees/search` | `/api/modules/hr/roster/employees/search` |
| **GET** | `/api/modules/hr/roster/autocomplete` | `/api/modules/hr/roster/autocomplete` |
| **GET/POST/PUT/DELETE** | `/api/modules/hr/roster/positions` | `/api/modules/hr/roster/positions` |
| **GET/POST** | `/api/modules/hr/roster/edps` | `/api/modules/hr/roster/edps` |
| **GET/POST/PUT/DELETE** | `/api/modules/hr/roster/departments` | `/api/modules/hr/roster/departments` |

## 项目管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/account/targets` | 登录 | 获取我的汇报对象 |
| **GET** | `/api/modules/work/projects` | 登录 + 项目权限 | 项目管理列表 |
| **POST** | `/api/modules/work/projects` | 登录 + 项目权限 | 新建项目管理记录 |
| **PUT** | `/api/modules/work/projects/:id` | 登录 + 项目权限 | 更新项目管理记录 |
| **DELETE** | `/api/modules/work/projects/:id` | 登录 + 项目权限 | 删除项目管理记录 |
| **GET** | `/api/modules/work/projects/members` | 登录 + 项目权限 | 项目管理人员列表 |
| **POST** | `/api/modules/work/projects/members` | 登录 + 项目权限 | 新建项目人员 |
| **PUT** | `/api/modules/work/projects/members/:id` | 登录 + 项目权限 | 更新项目人员 |
| **DELETE** | `/api/modules/work/projects/members/:id` | 登录 + 项目权限 | 删除项目人员 |

## 工作与报告

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/modules/work/reports` | 登录 | 周报列表 |
| **POST** | `/api/modules/work/reports` | 登录 | 提交周报 |
| **PUT** | `/api/modules/work/reports/:id` | 登录 | 更新周报 |
| **GET** | `/api/modules/work/reports/:id/versions` | 登录 | 查看周报版本 |
| **GET** | `/api/modules/work/reports/:id/versions/:version` | 登录 | 查看周报版本 |
| **GET** | `/api/settings/account/week-info` | 公开 | 获取当前周期信息 |
| **GET** | `/api/modules/work/tasks` | 登录 + 系统管理员 | 工作清单列表 |
| **POST** | `/api/modules/work/tasks` | 登录 + 系统管理员 | 创建工作项 |
| **DELETE** | `/api/modules/work/tasks/:id` | 登录 + 系统管理员 | 删除工作项 |
| **PUT** | `/api/modules/work/tasks/:id` | 登录 + 系统管理员 | 更新工作项 |

## Admin — 编码管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **DELETE** | `/api/settings/governance/company-codes` | 登录 + HR权限 | 删除公司编码 |
| **GET** | `/api/settings/governance/company-codes` | 登录 + HR权限 | 公司编码列表 |
| **PUT** | `/api/settings/governance/company-codes` | 登录 + HR权限 | 更新公司编码 |
| **DELETE** | `/api/settings/governance/department-codes` | 登录 + HR权限 | 删除部门编码 |
| **GET** | `/api/settings/governance/department-codes` | 登录 + HR权限 | 部门编码列表 |
| **PUT** | `/api/settings/governance/department-codes` | 登录 + HR权限 | 更新部门编码 |
| **DELETE** | `/api/settings/governance/position-codes` | 登录 + HR权限 | 删除岗位编码 |
| **GET** | `/api/settings/governance/position-codes` | 登录 + HR权限 | 岗位编码列表 |
| **PUT** | `/api/settings/governance/position-codes` | 登录 + HR权限 | 更新岗位编码 |

## Admin — 部门管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **DELETE** | `/api/settings/admin/department-admins` | 登录 | 移除部门管理员 |
| **GET** | `/api/settings/admin/department-admins` | 登录 | 部门管理员列表 |
| **PUT** | `/api/settings/admin/department-admins` | 登录 | 设置部门管理员 |
| **DELETE** | `/api/settings/admin/departments` | 登录 + 系统管理员 | Admin删除部门 |
| **GET** | `/api/settings/admin/departments` | 登录 + 系统管理员 | Admin部门列表 |

## Admin — 系统配置

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/admin/system-config` | 登录 + 系统管理员 | 系统配置列表 |
| **PUT** | `/api/settings/admin/system-config` | 登录 + 系统管理员 | 更新系统配置 |

## Admin — 权限管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/admin/department-permissions` | 登录 + 系统管理员 + 人事权限 | 部门权限列表 |
| **PUT** | `/api/settings/admin/department-permissions` | 登录 + 系统管理员 + 人事权限 | 切换部门权限 |
| **GET** | `/api/settings/admin/employee-permissions` | 登录 + 系统管理员 | 员工权限列表 |
| **PUT** | `/api/settings/admin/employee-permissions` | 登录 + 系统管理员 | 切换员工权限 |
| **GET** | `/api/settings/admin/permissions` | 登录 + 系统管理员 | 权限树 |
| **GET** | `/api/settings/admin/position-permissions` | 登录 + 系统管理员 | 岗位权限列表 |
| **PUT** | `/api/settings/admin/position-permissions` | 登录 + 系统管理员 | 切换岗位权限 |
| **PUT** | `/api/settings/admin/user-permissions` | 登录 + 系统管理员 | 切换用户权限 |

## Admin — 用户管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/admin/users` | 登录 + 系统管理员 | 用户列表 |
| **POST** | `/api/settings/admin/users/:id` | 登录 + 系统管理员 | 重置用户密码 |
| **PUT** | `/api/settings/admin/users/:id` | 登录 + 系统管理员 | 更新用户信息 |

## Admin — 编辑历史

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/governance/edit-history` | 登录 + HR权限 | 编辑历史查询 |

## Admin — 其他

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/settings/governance/company-relations` | 登录 + HR权限 |  |
