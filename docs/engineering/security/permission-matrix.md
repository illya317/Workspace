# 权限矩阵

> 每个资源的 `access` / `write` / `delete` / `admin` 预期行为。后续可转为 Playwright / API 测试。

## 资源清单

| 资源 key | Session 表达 | 动作 |
|----------|--------------|------|
| `hr` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `hr.roster.generated` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access（查看生成入口/记录）, write（生成/刷新并发布派生资料） |
| `finance` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `finance.ledger` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `finance.statementConfig` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.statementReview` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.statements` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.budget` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.analysis` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access |
| `finance.cost` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `finance.import` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access (preview), write (confirm) |
| `administration.contracts` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `work` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access（登录用户默认有效，并继承到普通 L2；不包含 capability）, write, delete, admin |
| `work.projects` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin（模块门禁，不放大对象范围） |
| `work.projects.viewAll` | `visibleResourceKeys` | access（独立全量可见资源，`runtimeParentKey=work.projects`） |
| `work.tasks` | `visibleResourceKeys` / `visibleWriteResourceKeys` | delete（登录用户默认有效；访问/编辑/删除列显示为默认规则）, admin |
| `settings.account` | `visibleResourceKeys` | access（登录用户默认有效） |
| `settings.admin` | `visibleResourceKeys` | access（任意资源管理员默认有效） |
| `settings.api` | `visibleResourceKeys` | access（Open API 控制台读取；不代表外部调用权限） |
| `settings.account.apiAccess` | `visibleResourceKeys` | access（个人 API Key 使用能力） |
| `settings.api.manage` | `visibleWriteResourceKeys` | write（Client 创建、secret 轮换、scope 授权；`runtimeParentKey=settings.api`） |
| `docs` | `visibleResourceKeys` | access（登录用户默认有效，并继承到普通 L2；不包含 capability） |
| `agent` | `visibleResourceKeys` | access |

## 页面 Guard

页面入口统一调用 `requireRouteAccess("<href>")`，由 registry 将 route 解析到 L1/L2 resource，再检查 RBAC 与 runtime enabled/disabled。页面不得直接手写 resource key 作为主门禁。

| 页面 | 权限检查 | 无权限行为 |
|------|---------|-----------|
| `/portal` | 无（入口页） | — |
| `/hr` | `requireResourceAccess("hr")` | redirect `/portal` |
| `/hr/roster` | `requireResourceAccess("hr.roster")` | redirect `/portal` |
| `/hr/performance` | `requireResourceAccess("hr.performance")` | redirect `/portal` |
| `/hr/analytics` | `requireResourceAccess("hr.analytics")` | redirect `/portal` |
| `/finance` | `requireResourceAccess("finance")` | redirect `/portal` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` | redirect `/portal` |
| `/finance/statement-config` | `requireResourceAccess("finance.statementConfig")` | redirect `/portal` |
| `/finance/statement-review` | `requireResourceAccess("finance.statementReview")` | redirect `/portal` |
| `/finance/statements` | `requireResourceAccess("finance.statements")` | redirect `/portal` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` | redirect `/portal` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` | redirect `/portal` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` | redirect `/portal` |
| `/finance/import` | `requireResourceAccess("finance.import")` | redirect `/portal` |
| `/administration` | `requireResourceAccess("administration")` | redirect `/portal` |
| `/administration/contracts` | `requireResourceAccess("administration.contracts")` | redirect `/portal` |
| `/production` | `requireResourceAccess("production")` | redirect `/portal` |
| `/production/qc` | `requireResourceAccess("production.qc")` | redirect `/portal` |
| `/work` | `requireResourceAccess("work")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/projects` | `requireResourceAccess("work.projects")` + module enabled + 项目对象级过滤 | redirect `/portal` 或模块未启用页 |
| `/work/tasks` | `requireResourceAccess("work.tasks")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/docs` | `requireResourceAccess("docs")` | redirect `/portal` |
| `/settings/account` | `requireRouteAccess("/settings/account")` | redirect `/portal` |
| `/settings/admin` | `requireRouteAccess("/settings/admin")` | redirect `/portal` |
| `/settings/api` | `requireRouteAccess("/settings/api")` | redirect `/portal` |
| `/settings/api/hr-generated` | `requireRouteAccess("/settings/api/hr-generated")` | redirect `/portal` |

## API Guard

| API | 方法 | 所需权限 |
|-----|------|---------|
| `/api/modules/hr/roster/*` | GET | `hr.roster.access` |
| `/api/modules/hr/roster/*` | POST/PUT/PATCH | `hr.roster.write` |
| `/api/modules/hr/roster/*` | DELETE | `hr.roster.delete` |
| `/api/modules/finance/ledger/accounts*` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/accounts*` | POST/PUT | `finance.ledger.write` |
| `/api/modules/finance/ledger/accounts*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/ledger/vouchers*` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/vouchers*` | POST/PUT | `finance.ledger.write` |
| `/api/modules/finance/ledger/vouchers*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/ledger/balances*` | GET/POST | `finance.ledger.access` (read/compute) |
| `/api/modules/finance/ledger/balances/reconcile` | POST | `finance.ledger.write` (upload + compare) |
| `/api/modules/finance/ledger/periods*` | GET/PUT | `finance.ledger.access/write` |
| `/api/modules/finance/ledger/init` | POST | `finance.ledger.write` |
| `/api/modules/finance/statement-config` | GET | `finance.statementConfig.access` |
| `/api/modules/finance/statement-config` | PUT | `finance.statementConfig.write` |
| `/api/modules/finance/statement-config/mappings` | GET | `finance.statementConfig.access` |
| `/api/modules/finance/statement-config/mappings` | POST/DELETE | `finance.statementConfig.write/delete` |
| `/api/modules/finance/statement-review/reviews` | GET | `finance.statementReview.access` |
| `/api/modules/finance/statement-review/reviews` | POST/PUT | `finance.statementReview.write` |
| `/api/modules/finance/statement-review/workpapers` | GET | `finance.statementReview.access` |
| `/api/modules/finance/statement-review/workpapers` | PUT | `finance.statementReview.write` |
| `/api/modules/finance/statements/reports` | GET | `finance.statements.access` |
| `/api/modules/finance/budget` | GET/POST | `finance.budget.access/write` |
| `/api/modules/finance/import/preview` | POST | `finance.import.access` |
| `/api/modules/finance/import/confirm` | POST | `finance.import.write` |
| `/api/modules/finance/cost/*` | GET | `finance.cost.access` |
| `/api/modules/finance/cost/*` | POST/PUT | `finance.cost.write` |
| `/api/modules/finance/cost/*` | DELETE | `finance.cost.delete` |
| `/api/modules/production/qc` | GET | `production.qc.access` |
| `/api/modules/production/qc` | POST | `production.qc.write` |
| `/api/modules/production/qc/[batchId]` | GET | `production.qc.access` |
| `/api/modules/production/qc/[batchId]` | PATCH | `production.qc.write` |
| `/api/modules/production/qc/[batchId]` | DELETE | `production.qc.delete` |
| `/api/modules/production/qc/[batchId]/submit` | POST | `production.qc.write` |
| `/api/modules/administration/contracts*` | GET | `administration.contracts.access` |
| `/api/modules/administration/contracts*` | POST/PUT | `administration.contracts.write` |
| `/api/modules/administration/contracts*` | DELETE | `administration.contracts.delete` |
| `/api/modules/work/projects*` | GET | `work.projects.access` + module enabled + 项目对象级过滤 |
| `/api/modules/work/projects*` | POST/PUT | `work.projects.write` + module enabled + 项目对象级写入校验 |
| `/api/modules/work/projects*` | DELETE | `work.projects.delete` + module enabled + 项目对象级删除校验 |
| `/api/modules/work/projects/members*` | GET/POST/PUT/DELETE | `work.projects` 对应动作 + module enabled + 项目对象级管理校验 |
| `/api/modules/work/projects/reference-options` | GET | FK registration permission + module enabled；项目/会议候选由 Work FK registry adapter 按对象可见性过滤 |
| `/api/settings/api/open/*` | GET | `settings.api.access` |
| `/api/settings/api/open/*` | POST/PUT | `settings.api.access` + `settings.api.manage.write` |

## Open API Scope

开放 API 不进入内部 RBAC `Resource` 表。下列权限由 `OpenApiClientScopeGrant` 授予，并通过 `Authorization: Bearer <secret>` 鉴权。

| API | 方法 | OpenApiScope | 运行态归属 |
|-----|------|--------------|------------|
| `/api/open/v1/hr/generated/roster` | GET | `hr.generated.roster.read` | `hr.roster` enabled |

## Work Project 对象级范围

- `work.projects.access/write/delete` 只控制项目模块入口和发起能力，不代表查看全部、管理全部或删除全部项目。
- 项目可见范围由创建人、主导部门负责人、项目 RASCI 成员、显式 `work.projects.viewAll` 和 root admin 共同决定。
- `work.projects.viewAll` 只授予全量可见，不授予全量管理或删除；需要管理/删除具体项目仍按对象级规则计算。
- `work.projects.viewAll` 不挂 `parentKey`，因此不会继承 `work.projects` 模块权限；它通过 `runtimeParentKey` 跟随 `work.projects` disabled。
- `work` 或 `work.projects` disabled 后，模块入口、页面、API、FK 暴露和 `work.projects.viewAll` 一起失效。

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- 内置 `admin` 账号是 root identity，不属于 RBAC resource，覆盖所有已启用资源的所有动作。
- 子资源 checker 先查子资源，未命中回退父资源
- `runtimeParentKey` 不参与 RBAC 继承，只参与模块运行态 enabled/disabled 级联。
