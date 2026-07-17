# 权限矩阵

> 本页记录权限矩阵应展示的资源 action、空间派生和 API guard 规则。实际权威来源仍是代码注册表；本页用于人工 review 和回归检查。

## 动作字典状态

新 action 字典在 `packages/platform/action-registry.ts`。Permission action 必须有唯一 icon；UI-only action 不进入 RBAC。历史四件套已下线，不再作为 runtime 兼容层。

## 资源 action 清单

下表来自当前 `permission-resource-policy.ts`，列出的 action 才应该在矩阵中可见或可授权。

结构化动作由注册表自动补齐，不应在每个资源里手工重复声明：

- 普通资源默认支持 `grant`；流程管理 capability 只支持 `configure`，被授权的流程管理员不能继续转授权。
- 有页面、菜单或受保护路由入口的资源自动支持 `entry`。
- 流程设置授权只挂在 `settings.admin.workflow -> category -> action` 专用 capability 树；普通业务资源和空间资源都不再承载流程 `configure`。
- root configure 表示管理全部流程，category configure 表示管理该分类当前及未来流程，action configure 表示只管理一个 `businessActionKey`。
- 这条 contract 由 `scripts/check/check-permission-actions.ts` 校验，避免流程页出现了某个资源，但权限矩阵没有对应配置权限。

| 资源 key | 状态 | 支持 action |
|---|---|---|
| `work` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `work.tasks` | business / space entry | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `reverse`, `submit`, `approve`, `reject`, `grant` |
| `work.projects` | business / space entry | `entry`, `read`, `create`, `update`, `delete`, `revise`, `grant` |
| `work.meetings` | business | `entry`, `read`, `create`, `update`, `delete`, `submit`, `approve`, `grant` |
| `hr` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `hr.roster` | business | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `reverse`, `submit`, `approve`, `reject`, `grant` |
| `hr.performance` | business | `entry`, `read`, `revise`, `reverse`, `submit`, `approve`, `reject`, `grant` |
| `hr.analytics` | business | `entry`, `read`, `grant` |
| `hr.roster.generated` | capability | `entry`, `read`, `export`, `grant` |
| `administration` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `administration.contracts` | business | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `finance` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `finance.ledger` | business | `entry`, `read`, `create`, `update`, `delete`, `revise`, `import`, `export`, `grant` |
| `finance.statements` | business | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `finance.analysis` | business | `entry`, `read`, `grant` |
| `finance.budget` | business | `entry`, `read`, `create`, `import`, `approve`, `grant` |
| `finance.cost` | business | `entry`, `read`, `delete`, `import`, `export`, `grant` |
| `finance.tax` | planned | `entry`, `read`, `grant` |
| `finance.treasury` | planned | `entry`, `read`, `grant` |
| `finance.import` | business | `entry`, `read`, `import`, `export`, `grant` |
| `production` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `production.qc` | business | `entry`, `read`, `create`, `update`, `delete`, `submit`, `approve`, `export`, `grant` |
| `external` | container | `entry`, `read`, `grant` |
| `external.customers` | business | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `external.suppliers` | business | `entry`, `read`, `create`, `update`, `delete`, `grant` |
| `capitalSecurities` | container | `entry`, `read`, `create`, `update`, `grant` |
| `capitalSecurities.investors` | planned | `entry`, `read`, `grant` |
| `capitalSecurities.governance` | business | `entry`, `read`, `create`, `update`, `grant` |
| `docs` | docs | `entry`, `read`, `grant` |
| `docs.company` | docs | `entry`, `read`, `grant` |
| `docs.expense` | docs | `entry`, `read`, `grant` |
| `docs.editor` | business / space entry | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `reverse`, `submit`, `approve`, `reject`, `export`, `grant` |
| `library` | container | `entry`, `read`, `update`, `grant` |
| `library.basicInfo` | business | `entry`, `read`, `update`, `archive`, `import`, `export`, `configure`, `grant` |
| `settings` | container | `entry`, `read`, `grant` |
| `settings.account` | business | `entry`, `read`, `update`, `revise`, `grant` |
| `settings.admin` | business | `entry`, `read`, `configure`, `audit`, `grant` |
| `settings.admin.workflow` / `.category.*` / `.action.*` | capability | `configure` |
| `settings.api` | business | `entry`, `read`, `export`, `grant` |
| `settings.ui` | docs | `entry`, `read`, `grant` |
| `settings.account.apiAccess` | capability | `entry`, `read`, `revise`, `grant` |
| `settings.api.manage` | capability | `entry`, `read`, `create`, `update`, `revise`, `grant` |
| `agent` | headless | `entry`, `read`, `submit`, `grant` |
| `agent.assistant` | capability | `entry`, `read`, `submit`, `grant` |
| `agent.source` | capability | `read`, `submit`, `grant` |

`agent` 是无页面的运行态模块。普通员工工具栏与 `/api/agent/**` 只认 `agent.assistant`；其 owner 是 `settings.account`，`runtimeParentKey=agent` 仅控制模块停用。源码检索与 CNB PR 提案另需显式 `agent.source.read/submit`，其 owner 是 `agent.assistant`。虚拟员工模式还要求所选 profile、actor 岗位权限和工具白名单同时通过；当前只有 AI0004 获得 Workspace source grants，且这些 profile-only 工具不会暴露给本人助手。AI0001-AI0003 不承担 Workspace 对话，本地代码开发、直接提交和部署仍在外部运行时完成。

## 空间派生资源

`work.tasks`、`work.projects`、`docs.editor` 通过 `spaceRegistrations` 声明标准业务空间。它们的 root resource 是页面入口；直接授权时只允许 `entry`。完整业务动作落到隐藏派生资源：

| 空间父资源 | 子资源 |
|---|---|
| `space.department` | `space.department.tasks`, `space.department.projects`, `space.department.templates` |
| `space.committee` | `space.committee.tasks`, `space.committee.projects`, `space.committee.templates` |
| `space.company` | `space.company.tasks`, `space.company.projects`, `space.company.templates` |

空间父资源的 supported actions 必须等于其子资源 supported actions 的并集。`scripts/check/check-permission-actions.ts` 会校验这一点，避免空间父级凭空支持未接入动作。

空间派生只补入口：如果用户拥有 `space.department.projects.update`，矩阵可以在 `work.projects.entry` 上显示黄色派生入口，但不能把 `work.projects.update` 也染出来。

## 矩阵来源颜色

颜色只表达当前格子的直接来源，不沿权限链继续传染。

| source | 颜色 | 说明 |
|---|---|---|
| direct | 绿 | 当前主体直接授权 |
| system / implicit | 橙 | 系统默认、硬编码或 root/全局业务管理来源 |
| position / department | 红 | 岗位或部门授权 |
| ancestor / implied | 蓝 | 上级资源下传，或同资源高阶 action 隐含当前 action |
| entry / child | 黄 | 下级资源、空间或自然空间派生入口 |
| null | 灰 | 未授权 |

摘要优先级：绿 > 橙 > 红 > 蓝 > 黄 > 灰。

## 页面 Guard

页面入口统一走 registry：

- 业务 L1/L2 页面使用 `requireRouteAccess("<href>")` 或 `requireResourceAccess(resourceKey)`。
- `/settings/admin` 使用 `requireAdminManageAccess()`，只允许 root identity、IT 默认授权负责人或有资源级 `grant` / `configure` 管理范围的用户进入。
- 空间业务页不承载授权编辑入口；权限配置集中在 Settings 后台和标准空间权限 API。

## API Guard

API 权限不再从 HTTP method 粗暴推旧动作。当前规则：

- 业务 API 统一使用 `/api/modules/<module>/<resource path>`，Platform 从 URL 自动推导 owner `resourceKey`；`apiPrefixes` 只保留旧兼容路径，且对应 contract 必须声明 `migrationNote`。
- `permission-api-action-policy.ts` 用 `pathPattern + requiredActions + scopeExtractor` 为具体 method/path 声明 effective authorization。
- 未显式登记的 protected API 使用默认动作：GET=`read`，POST=`create`，PUT/PATCH=`update`，DELETE=`delete`。
- 对象级、流程级和后台治理范围授权必须标记 `runtimeEnforcement="serviceDelegated"` 并在 service 层解析真实对象、流程或可管理资源范围后检查；空间型路径优先通过 `scopeExtractor` 产出 `scopeId/projection`，再按 service 的对象细节继续收口。

典型 service-delegated 场景：

| 场景 | API policy | 真实授权 |
|---|---|---|
| 项目字段或成员修改 | root resource 先要求 `read` | service 根据项目对象解析空间和项目角色，再检查 `create/update/delete/revise/grant` |
| 工作任务修改 | root resource 先要求 `read` | service 根据目标空间和任务状态检查派生空间 action |
| 模板发布/撤回/审批 | `submit` / `reverse` / `approve` / `reject` | docs editor adapter 根据模板空间和流程状态检查 |
| 空间授权查看/修改 | `grant` | 标准空间权限 route 检查当前 scope 的 scoped `grant` 或 root identity |
| 后台授权/配置/台账 | `grant` / `configure` / `audit` | admin route 根据 root、可管理资源范围或 workflow admin access 过滤 |
| 个人账号自助接口 | `settings.account.read` | service 限定为当前 session 用户 |

## Open API Scope

开放 API 不进入内部 RBAC resource/action。`/api/open/v1/**` 使用 Open API 专用 scope、client secret 和 client-scope grant。

内部控制台仍走 RBAC：`settings.api` 控制读取和导出，`settings.api.manage` 控制 client/secret/scope 管理，个人 API Key 使用能力归属 `settings.account.apiAccess`。

## 验证命令

权限模型相关变更至少跑：

```bash
npm run action-registry:check
node --import tsx scripts/check/check-permission-actions.ts
npm run typecheck:quick
```

涉及 Prisma schema、migration、seed 或资源同步时，还要跑：

```bash
npm run check:data
npm run db:seed:resources
```

涉及 API/page/resource contract 时，再跑：

```bash
npm run check:arch
```
