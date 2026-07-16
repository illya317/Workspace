# RBAC 权限模型

## 当前事实源

当前 RBAC 只认 `resourceKey + actionKey + scopeId`。

- 动作注册表：`packages/platform/action-registry.ts`
- 运行时动作闭包：`packages/platform/permission-actions.ts`
- 资源支持动作：`packages/platform/permission-resource-policy.ts`
- API 动作需求：`packages/platform/permission-api-action-policy.ts`
- API / 页面 / resource 注册：`packages/platform/module-registry.ts`
- DB 事实表：`UserResourceActionGrant`、`PositionResourceActionGrant`、`DepartmentResourceActionGrant`

历史四件套 `access/write/admin/withdraw` 不再作为权限 action、API policy 或 DB 授权值使用；`delete` 是当前原子动作，只表示删除记录。

## 动作层

Permission actions：

| 分组 | action | 说明 |
|---|---|---|
| 入口与普通维护 | `entry` | 进入页面、菜单或模块 |
| 入口与普通维护 | `read` | 查看列表、详情、普通数据 |
| 入口与普通维护 | `create` | 新建记录或草稿 |
| 入口与普通维护 | `update` | 修改已有记录 |
| 入口与普通维护 | `delete` | 删除记录 |
| 生命周期与业务效力 | `archive` | 归档/反归档，历史事实仍有效 |
| 生命周期与业务效力 | `revise` | 受控修订、重开、从历史快照写回 |
| 生命周期与业务效力 | `reverse` | 撤销/反向处理已生效业务动作 |
| 生命周期与业务效力 | `lock` / `unlock` | 关闭/打开期间或写入窗口 |
| 流程动作 | `submit` | 提交/发起流程 |
| 流程动作 | `approve` | 审批通过 |
| 流程动作 | `reject` | 审批驳回 |
| 数据交换与外发 | `import` | 导入/摄取/批量确认 |
| 数据交换与外发 | `export` | 导出、下载、打印、邮件外发 |
| 数据交换与外发 | `apiUse` | 使用 API / scope 调用 |
| 治理、共享与审计 | `share` | 单条记录共享或临时协作访问 |
| 治理、共享与审计 | `grant` | 授权管理 |
| 治理、共享与审计 | `configure` | 规则、流程、系统配置 |
| 治理、共享与审计 | `audit` | 查看审计和权限台账 |

包含关系由 action registry 决定。基础规则：

- `read/create/update/delete/archive/revise/reverse/submit/approve/reject/export/share` 都隐含 `entry`；除 `entry` 自身外也隐含 `read`。
- `grant/configure/audit/import/apiUse/lock/unlock` 不自动扩大成业务读写，除 registry 显式声明外只代表自己。
- `approve` 不隐含 `reject`，`submit` 不隐含 `reverse`。
- `delete` 不隐含 `update` 或 `create`。

第一版 SoD 只做提示：同一对象在同一资源同时拥有 `submit` 和 `approve` 时，矩阵展示风险，不阻断保存。

## 授权对象

| subjectType | 说明 |
|---|---|
| `user` | 直接授权到用户 |
| `position` | 岗位授权，岗位下在职人员继承 |
| `department` | 部门授权，部门成员继承 |

来源优先级用于展示和摘要：直接授权 > 系统/硬编码 > 岗位/部门 > 上级资源/动作隐含 > 下级或空间派生入口 > 无权限。

内置 `username = "admin"` 是 root identity，不属于 RBAC 授权对象，不进入授权矩阵。

## 资源树与动作策略

资源树只表达普通父子关系。父资源 action grant 默认可下传到子资源，但仅限子资源在 `ancestorInheritedActions` 声明可继承的 action。

资源可授权动作来自 `permission-resource-policy.supportedActions`。后端写入授权时会拒绝资源未支持的 action；矩阵也不会展示未接入动作。

容器资源通常只支持入口、读、基础维护和 `grant`。业务资源按当前 API 和业务规则声明实际支持动作。Capability resource 通过 `capabilityOwnerKey` 要求 owner 资源至少可进入；`runtimeParentKey` 只用于 enabled/disabled 运行态耦合，不参与 RBAC 继承。

### 显式授权写入与并发边界

`setSubjectPermissionActionGrant(s)` 是显式 action grant 的共享写入口。PostgreSQL 事务先按稳定顺序获取授权域 advisory lock：授权域包含本次目标资源和调用方声明的授权前置资源，并为每个资源展开自身、所有 registry 祖先，以及递归 `capabilityOwnerKey` owner 及其祖先；随后再按稳定顺序获取 `subjectType + subjectId + resourceKey + actionKey + scopeId` 授权元组锁。取得锁后，同一事务才重新校验主体存在、root identity 禁止授权、Resource FK 和调用方 `beforeMutation(tx)` 授权前置条件，然后写入 grant 与对应台账。

这组锁只线性化经共享 setter 写入的显式 grant。构造授权域使用的 registry `parentKey/capabilityOwnerKey` 必须与 evaluator 读取的已 seed `Resource` 父链保持一致；修改资源关系时必须同步 registry、resource seed 和对应检查。HR 任职/部门成员关系、隐式管理员事实、root/canLogin、模块启停、seed 或直接 SQL 不共享这组锁；通用流程的 `preauthorizedActor` 也只表示上游业务授权已完成，不能由 grant 锁替代。依赖这些事实保持稳定的写入必须在自身事务域内加锁并重新校验。

## 空间权限

空间不是 capability。空间是 L2/L3 业务资源的 scoped projection。

注册入口是 `packages/platform/module-registry.ts` 的 `spaceRegistrations`。当前注册：

| registration | root resource | space kind | targets |
|---|---|---|---|
| `work.tasks` | `work.tasks` | `tasks` | personal, department, committee, company |
| `work.projects` | `work.projects` | `projects` | personal, department, committee, company |
| `docs.editor` | `docs.editor` | `templates` | personal, department, committee, company |

派生资源：

```txt
space.department
  space.department.tasks
  space.department.projects
  space.department.templates

space.committee
  space.committee.tasks
  space.committee.projects
  space.committee.templates

space.company
  space.company.tasks
  space.company.projects
  space.company.templates
```

规则：

- 注册空间的 L2 root resource 只承载页面入口，只允许直接授予 `entry`。
- 完整业务动作授予派生空间资源，例如 `space.department.projects.update`。
- 派生空间父资源的 supported actions 等于其子空间资源 supported actions 的并集，不再无条件支持全 action。
- `scopeId` 表示具体空间实例，例如 `department:12`、`committee:operating-committee`、`company:company`。
- 下级空间有效权限只向 root resource 派生 `entry`，不会派生业务写入、审批、删除或授权管理。
- 空间权限 API 复用 `@workspace/platform/server/standard-space-permission-route`；业务页不恢复本地权限设置入口。

天然空间来源：

- 个人空间：本人天然拥有业务 manager 语义，但不开放个人权限配置 UI。
- 部门空间：`Department.managerPositionId` 对应岗位在职人员是该部门空间业务 manager。
- 运营委员会空间：执行总裁是业务 manager。
- 公司空间：默认全员 viewer。

业务 manager 不等于 `grant`。空间权限配置入口只认对应 scoped `grant`、全局 `grant` 或 root identity。

## 登录与后台入口

登录只看 `User.canLogin` 和 `sessionVersion`，不看任何 RBAC resource。

默认有效入口：

- 已登录用户默认拥有 `settings.account` 的 `entry/read`。
- 已登录用户默认拥有 `docs` 的 `entry/read`。
- 注册了空间的业务资源可通过空间注册和自然空间来源派生 `entry`。

`/settings/admin` 走 `requireAdminManageAccess()`：root identity，或拥有至少一个资源级 `grant` / `configure` 管理范围的用户才可进入。scoped `grant` 只在对应空间权限接口生效，不放大到后台全局授权矩阵。

## Agent 与虚拟员工

`agent` 是有真实 `/agent` L1 的受限管理容器，与普通员工使用的工具栏助手分开授权：

- `agent.entry/read`：进入管理中心及其标准 `ModuleHomePage`。管理中心固定包含 `agent.config`、`agent.usage`、`agent.reports` 三个 L2。
- `agent.config.entry/read/configure`：查看 Agent 档案、运行时、能力与权限边界；配置写权限单独使用 `configure`。
- `agent.usage.entry/read/audit`：`read` 只看聚合使用情况，员工与会话明细需要 `audit`。
- `agent.reports.entry/read/audit`：`read` 只看 Agent 级汇总，单次运行、请求人、结果与错误明细需要 `audit`。

`agent.assistant` 是普通员工工具栏和 `/api/agent/**` 使用的 headless capability。它以 `settings.account` 为 `capabilityOwnerKey`，所以获得助手权限不会暴露 `/agent` 管理中心；`runtimeParentKey=agent` 只让 Agent 模块停用时同步停止运行态，不产生 RBAC 继承：

- `agent.assistant.read`：发现可用 profile，并读取能力清单或本人安全视图。
- `agent.assistant.submit`：显示工具栏助手、提交消息，以及确认/取消自己创建的 proposal；`submit` 按 action registry 同时隐含 `entry/read`。
- `agent.source.read/submit`：分别控制 Workspace 源码检索、CNB PR 草案及确认 executor。该 capability 以 `agent.assistant` 为 owner，所以双方还必须拥有显式 assistant entry，但不需要 `agent.config.entry`。助手授权不会自动迁移或推导为 source 授权。
- 每个智能体 tool 必须声明最小 `resourceKey + action`。本人助手按请求人执行；选择虚拟员工后，Platform 在初次暴露、每次 tool call 和 proposal 确认时实时检查请求人与虚拟员工 actor 的权限交集。
- 虚拟员工模式只暴露显式声明 `delegatedExecution` 且进入该 `AgentProfile` 工具白名单的 adapter。`requiresAgentProfile` 工具在本人助手中始终失败关闭；toolbar profile discovery 还会隐藏对当前请求人没有任何可用注册工具的 profile。尚未实现双主体对象/数据范围校验的业务 adapter 必须失败关闭。
- 当前 Workspace 绑定的 AI0004 只允许源码检索和 PR 提案，并由 provisioner 精确维护 assistant/source grants；AI0001-AI0003 不获得 Workspace source grants。本地代码开发、直接提交和部署属于本地 Codex、CI 或服务器运行时，不在 Workspace 对话中执行。
- 智能体 action ceiling 是用户 RBAC 之上的全局收紧策略，只能减少任意模型 provider 可见的 action，不能授予用户原本没有的权限。root identity 也受 ceiling 约束。
- 默认 ceiling 只允许 `entry/read/create/update/submit/import/export`；`delete/archive/revise/reverse/lock/unlock/approve/reject/share/apiUse/grant/configure/audit` 默认关闭。新注册 action 默认关闭，必须由 root admin 在“智能体策略”中显式复核后才能开放。
- proposal 确认不是全局 `approve`。确认只表示请求人继续执行这次智能体提案；proposal 固定创建时的虚拟员工 actor，先原子抢占 `pending -> executing`，再实时重验全局上限与双方权限，业务写入以 actor 进入编辑审计。
- proposal 取消不做独立 `reverse`。它只取消本人的 pending proposal，不撤销已生效业务事实。

## Open API 边界

外部开放 API 不使用内部 RBAC `Resource`。`/api/open/v1/**` 只看 `OpenApiClient`、`OpenApiScope` 和 `OpenApiClientScopeGrant`，通过 `Authorization: Bearer <secret>` 鉴权。

内部控制台仍走 RBAC：

- `settings.api.read`：查看 Open API 控制台。
- `settings.api.export`：导出控制台数据。
- `settings.api.manage.create/update/revise/grant`：管理 Client、secret 和 scope；调用日志读取仍归 `settings.api.read` 控制。
- `settings.account.apiAccess.revise`：个人 API Key 申请/重置。

## Root Identity 与系统来源

Root identity：

- 只包括内置 `username = "admin"` 账号。
- 不获得任何 RBAC resource，不写入授权表。
- 可绕过 RBAC 检查访问所有已启用资源；模块 disabled 仍优先生效。

系统来源：

- `IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS` 中的在职员工获得系统来源的全资源业务管理能力，但不是 root identity。
- IT/信息部门负责人岗位是隐式全资源 `grant` 来源。
- 系统来源在矩阵显示为橙色，仍可追溯为硬编码/默认授予。

## 权限判断流程

```txt
evaluatePermissionAction(userId, resourceKey, actionKey, scope?)
  -> root identity? true
  -> resource enabled? 否则 false
  -> resource policy 支持 action? 否则 false
  -> 注册空间 root resource 且 action != entry? false
  -> capability? 先要求 owner entry
  -> settings.admin entry? evaluate 层要求全局授权管理范围；页面入口另由 requireAdminManageAccess 接受 grant/configure 管理范围
  -> 取 resource 及 DB parent 链
  -> action != grant 时检查系统业务管理来源
  -> action == grant 时检查系统授权管理来源
  -> 按 ancestorInheritedActions 决定是否查祖先资源
  -> 按 actionImplies 匹配直接/岗位/部门 action grant
  -> 命中 true，否则 false
```

## API 权限

API contract 分两层：

- 业务 API 统一使用 `/api/modules/<module>/<resource path>`，Platform 从 URL 自动推导 owner `resourceKey`；`apiPrefixes` 只保留旧兼容路径。
- `permission-api-action-policy.ts` 用 `pathPattern + requiredActions + scopeExtractor` 说明具体方法/路径的 effective authorization。

`pathPrefix` 只解决 API owner 和注册覆盖，owner resource 必须从规范 URL 自动推导，不能在 `apiGuards/apiRoutes` 手写；旧兼容路径无法直接推导 resource 时，必须声明 `migrationNote`。授权运行时读取的是 `authorization.resourceKey + action + scopeId/projection`。空间型路径必须优先用命名正则组或 query/body 派生 scope，不要把同一前缀下的不同空间混成一个无 scope 的资源判断。

未显式登记的 protected API 按最小默认动作处理：

| HTTP method | 默认 action |
|---|---|
| GET | `read` |
| POST | `create` |
| PUT / PATCH | `update` |
| DELETE | `delete` |

需要先解析对象、空间或流程上下文的路径标记 `runtimeEnforcement = "serviceDelegated"`，并在业务 service 中做真实 guard。例如项目对象编辑、审批撤回、模板发布等。空间权限这类路径可先通过 `scopeExtractor` 解析出目标空间，再由 service 处理对象级细节。

新增 API 不得在 route 内重写权限判断；route 只做认证、请求形状、调用 service 和返回 DTO。

## DB 与迁移

当前 PostgreSQL baseline 不再包含旧 Role 表或 `Resource.maxRoleKey`。服务器部署顺序固定为：

1. 执行 `prisma migrate deploy`。
2. 执行 resource seed，同步 `Resource.scopeTypes` / `Resource.scopeInheritanceMode` / resource 树。
3. 执行 `npm run db:permission-actions:check`，确认 runtime grant 表的 `actionKey` 都属于当前 permission action 白名单且符合对应 resource action policy，并确认授权台账不含旧 permission action。
4. 执行 `npm run check:data` 和 `npm run action-registry:check`。

部署不再运行通用权限数据 normalizer，也不在启动阶段创建 marker/表。旧 SQLite 的 action bundle 和 workflow capability 归一化必须在冻结副本上完成，再由 SQLite-to-PostgreSQL ETL 搬运；PostgreSQL 上的新权限语义变化必须使用审查过的 migration/service，不得由 deploy 脚本静默扩大或删除授权。旧 normalizer 只读归档在 `scripts/migrate/sqlite-legacy/`，不得连接 PostgreSQL。

`npm run db:permission-actions:check` 是只读验收命令。它不写 marker、不迁移数据，只检查 `UserResourceActionGrant`、`PositionResourceActionGrant`、`DepartmentResourceActionGrant` 和 `PermissionGrantLedgerEvent` 的 `actionKey` 是否仍含 `access/write/admin/withdraw` 或其它非当前 permission action；三张 runtime grant 表还会额外检查对应 resource 是否支持该 action，注册空间 root resource 只允许直接保留 `entry`。授权台账保留历史审计语义，不因为 resource 后续取消某个当前 permission action 而删除旧事件。

Open API 的 `OpenApiScope.action` / `OpenApiClientScopeGrant.action` 属于开放 API scope 边界，不是内部 RBAC permission action。

`scripts/check/check-schema-governance.js` 会阻止旧 RBAC 兼容脚本和旧 schema 字段恢复。

## 后台矩阵 UI

- 左侧：资源树。
- 顶部：员工 / 岗位 / 部门切换。
- 列：基础权限、流程、生命周期、数据交换、治理、风险、展开。
- 行：收起态显示 summary；展开态显示动作树、来源、隐含关系和 SoD 提示。
- 空间入口 L2 只展示 `entry`；派生空间资源展示自身 supported actions。
- 颜色只表达当前格子的直接来源，不继续传染到间接结果。完整根因从当前格逐级追溯。

颜色语义：

| source | 颜色 | 说明 |
|---|---|---|
| direct | 绿 | 当前主体直接授权 |
| system / implicit | 橙 | 系统默认或硬编码来源 |
| position / department | 红 | 岗位/部门授权 |
| ancestor / implied | 蓝 | 上级资源下传或同资源高级动作隐含 |
| entry / child | 黄 | 下级/空间/自然空间派生入口 |
| null | 灰 | 未授权 |

## Work 业务对象规则

Work 项目和任务同时使用 RBAC 入口、标准业务空间 scoped grant 和业务对象规则。

- `work.projects` / `work.tasks` root resource 只表示功能入口。
- 部门、公司、运营委员会空间里的业务动作在 `space.<target>.projects` / `space.<target>.tasks` 上授权。
- 项目可见性还受创建人、主导部门负责人、RASCI 成员、项目对象角色影响。
- 指派表是业务配置，不在 RBAC 矩阵中管理。

模块 disabled 优先于所有业务对象权限：L1/L2 disabled 后，页面、API、FK 和相关资源一起失效。
