# HR API Reference

**72 endpoints** across 11 groups

GET: 31 | POST: 10 | PUT: 19 | DELETE: 12

## 认证与账户

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **POST** | `/api/auth/change-password` | 登录 | 修改密码 |
| **DELETE** | `/api/auth/dev-login` | 公开 | 退出登录 |
| **POST** | `/api/auth/dev-login` | 公开 | 开发环境登录 |
| **GET** | `/api/auth/me` | 登录 | 获取当前登录用户信息 |
| **GET** | `/api/my-api-key` | 登录 | 获取我的API Key |
| **POST** | `/api/my-api-key` | 登录 | 申请/重新申请API Key |
| **GET** | `/api/user/routine` | 登录 | 获取用户日常模板 |
| **PUT** | `/api/user/routine` | 登录 | 更新用户日常模板 |

## 花名册与组织架构（Canonical）

新代码请统一使用 `/api/hr/*` 入口。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/hr/roster` | 登录 + HR权限 | 花名册（含岗位信息扁平化、Excel导出） |
| **GET** | `/api/hr/employees` | 登录 + HR权限 | 员工列表（分页） |
| **GET** | `/api/hr/employees/search` | 登录 + 系统管理员 | 员工搜索（姓名/工号/拼音） |
| **PUT** | `/api/hr/employees/:id` | 登录 + HR权限 | 更新员工基础信息 |
| **GET** | `/api/hr/autocomplete` | 登录 + HR权限 | 通用自动补全（部门/岗位/员工/项目） |
| **GET** | `/api/hr/positions` | 登录 + HR权限 | 岗位列表（分页） |
| **POST** | `/api/hr/positions` | 登录 + HR写权限 | 创建岗位 |
| **PUT** | `/api/hr/positions/:id` | 登录 + HR写权限 | 更新岗位 |
| **DELETE** | `/api/hr/positions/:id` | 登录 + HR删权限 | 删除岗位 |
| **GET** | `/api/hr/edps` | 登录 + HR权限 | 员工-部门-岗位关联列表 |
| **GET** | `/api/hr/departments` | 登录 + 系统管理员 | 部门列表 |
| **POST** | `/api/hr/departments` | 登录 + 系统管理员 | 创建部门 |
| **PUT** | `/api/hr/departments/:id` | 登录 + 系统管理员 | 更新部门 |
| **DELETE** | `/api/hr/departments/:id` | 登录 + 系统管理员 | 删除部门 |
| **GET** | `/api/hr/projects` | 登录 + HR权限 | 项目列表 |
| **POST** | `/api/hr/projects` | 登录 + HR权限 | 创建项目 |
| **PUT** | `/api/hr/projects/:id` | 登录 + HR权限 | 更新项目 |
| **DELETE** | `/api/hr/projects/:id` | 登录 + HR权限 | 删除项目 |
| **GET** | `/api/hr/employee-projects` | 登录 + HR权限 | 员工项目关联列表 |
| **POST** | `/api/hr/employee-projects` | 登录 + HR权限 | 创建员工项目关联 |
| **PUT** | `/api/hr/employee-projects/:id` | 登录 + HR权限 | 更新员工项目关联 |
| **DELETE** | `/api/hr/employee-projects/:id` | 登录 + HR权限 | 删除员工项目关联 |

## 花名册与组织架构（兼容层，已废弃）

以下入口仍保留纯代理，供旧调用方过渡，**新代码禁止直接使用**。

| Method | Path | 代理目标 |
|--------|------|----------|
| **GET** | `/api/employees` | `/api/hr/roster` |
| **GET** | `/api/employees/search` | `/api/hr/employees/search` |
| **GET** | `/api/employees/autocomplete` | `/api/hr/autocomplete` |
| **GET/POST/PUT/DELETE** | `/api/positions` | `/api/hr/positions` |
| **GET/POST** | `/api/employee-positions` | `/api/hr/edps` |
| **GET/POST/PUT/DELETE** | `/api/departments` | `/api/hr/departments` |
| **GET/POST/PUT/DELETE** | `/api/projects` | `/api/hr/projects` |
| **GET/POST/PUT/DELETE** | `/api/employee-projects` | `/api/hr/employee-projects` |

## 项目管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/my-targets` | 登录 | 获取我的汇报对象 |

## 工作与报告

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/reports` | 登录 | 周报列表 |
| **POST** | `/api/reports` | 登录 | 提交周报 |
| **PUT** | `/api/reports/:id` | 登录 | 更新周报 |
| **GET** | `/api/reports/:id/versions` | 登录 | 查看周报版本 |
| **GET** | `/api/reports/:id/versions/:version` | 登录 | 查看周报版本 |
| **GET** | `/api/week-info` | 公开 | 获取当前周期信息 |
| **GET** | `/api/works` | 登录 + 系统管理员 | 工作清单列表 |
| **POST** | `/api/works` | 登录 + 系统管理员 | 创建工作项 |
| **DELETE** | `/api/works/:id` | 登录 + 系统管理员 | 删除工作项 |
| **PUT** | `/api/works/:id` | 登录 + 系统管理员 | 更新工作项 |

## Admin — 编码管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **DELETE** | `/api/admin/company-codes` | 登录 + HR权限 | 删除公司编码 |
| **GET** | `/api/admin/company-codes` | 登录 + HR权限 | 公司编码列表 |
| **PUT** | `/api/admin/company-codes` | 登录 + HR权限 | 更新公司编码 |
| **DELETE** | `/api/admin/department-codes` | 登录 + HR权限 | 删除部门编码 |
| **GET** | `/api/admin/department-codes` | 登录 + HR权限 | 部门编码列表 |
| **PUT** | `/api/admin/department-codes` | 登录 + HR权限 | 更新部门编码 |
| **DELETE** | `/api/admin/position-codes` | 登录 + HR权限 | 删除岗位编码 |
| **GET** | `/api/admin/position-codes` | 登录 + HR权限 | 岗位编码列表 |
| **PUT** | `/api/admin/position-codes` | 登录 + HR权限 | 更新岗位编码 |

## Admin — 部门管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **DELETE** | `/api/admin/department-admins` | 登录 | 移除部门管理员 |
| **GET** | `/api/admin/department-admins` | 登录 | 部门管理员列表 |
| **PUT** | `/api/admin/department-admins` | 登录 | 设置部门管理员 |
| **DELETE** | `/api/admin/departments` | 登录 + 系统管理员 | Admin删除部门 |
| **GET** | `/api/admin/departments` | 登录 + 系统管理员 | Admin部门列表 |

## Admin — 系统配置

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/admin/system-config` | 登录 + 系统管理员 | 系统配置列表 |
| **PUT** | `/api/admin/system-config` | 登录 + 系统管理员 | 更新系统配置 |

## Admin — 权限管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/admin/department-permissions` | 登录 + 系统管理员 + 人事权限 | 部门权限列表 |
| **PUT** | `/api/admin/department-permissions` | 登录 + 系统管理员 + 人事权限 | 切换部门权限 |
| **GET** | `/api/admin/employee-permissions` | 登录 + 系统管理员 | 员工权限列表 |
| **PUT** | `/api/admin/employee-permissions` | 登录 + 系统管理员 | 切换员工权限 |
| **GET** | `/api/admin/permissions` | 登录 + 系统管理员 | 权限树 |
| **GET** | `/api/admin/position-permissions` | 登录 + 系统管理员 | 岗位权限列表 |
| **PUT** | `/api/admin/position-permissions` | 登录 + 系统管理员 | 切换岗位权限 |
| **PUT** | `/api/admin/user-permissions` | 登录 + 系统管理员 | 切换用户权限 |

## Admin — 用户管理

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/admin/users` | 登录 + 系统管理员 | 用户列表 |
| **POST** | `/api/admin/users/:id` | 登录 + 系统管理员 | 重置用户密码 |
| **PUT** | `/api/admin/users/:id` | 登录 + 系统管理员 | 更新用户信息 |

## Admin — 编辑历史

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/admin/edit-history` | 登录 + HR权限 | 编辑历史查询 |

## Admin — 其他

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **GET** | `/api/admin/company-relations` | 登录 + HR权限 |  |
