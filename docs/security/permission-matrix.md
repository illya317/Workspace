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
| `work` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.projects` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin（模块门禁，不放大对象范围） |
| `work.projects.viewAll` | `visibleResourceKeys` | access（独立全量可见资源，`runtimeParentKey=work.projects`） |
| `work.tasks` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.reports` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.history` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `system` | `manageableResourceKeys` | admin |
| `settings.admin` | `manageableResourceKeys` | admin |
| `settings.governance` | `visibleResourceKeys` | access |
| `settings.api` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access（Open API 控制台读取）, write（Client/secret/scope 管理；不代表外部调用权限） |
| `docs.api` | `visibleResourceKeys` | access |
| `agent` | `visibleResourceKeys` | access |

## 页面 Guard

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
| `/production/qc-batches` | `requireResourceAccess("production.qcBatches")` | redirect `/portal` |
| `/production/qc-templates` | `requireResourceAccess("production.qcTemplates")` | redirect `/portal` |
| `/work` | `requireResourceAccess("work")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/projects` | `requireResourceAccess("work.projects")` + module enabled + 项目对象级过滤 | redirect `/portal` 或模块未启用页 |
| `/work/tasks` | `requireResourceAccess("work.tasks")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/reports` | `requireResourceAccess("work.reports")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/history` | `requireResourceAccess("work.history")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/docs` | `requireResourceAccess("docs")` | redirect `/portal` |
| `/docs/api-guide` | `docs.api.access OR settings.api.access` | redirect `/portal` |
| `/settings/api` | `requireResourceAccess("settings.api")` | redirect `/portal` |
| `/settings/api/hr-generated` | `requireResourceAccess("settings.api")` | redirect `/portal` |

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
| `/api/modules/production/qc-templates/config` | GET | `production.qcTemplates.access` |
| `/api/modules/production/qc-templates/[templateId]` | GET | `production.qcTemplates.access` |
| `/api/modules/production/qc-templates/feedback` | GET | `production.qcTemplates.access` |
| `/api/modules/production/qc-templates/feedback` | POST | `production.qcTemplates.write` |
| `/api/modules/production/qc-batches` | GET | `production.qcBatches.access` |
| `/api/modules/production/qc-batches` | POST | `production.qcBatches.write` |
| `/api/modules/production/qc-batches/[batchId]` | GET | `production.qcBatches.access` |
| `/api/modules/production/qc-batches/[batchId]` | PATCH | `production.qcBatches.write` |
| `/api/modules/production/qc-batches/[batchId]` | DELETE | `production.qcBatches.delete` |
| `/api/modules/production/qc-batches/[batchId]/submit` | POST | `production.qcBatches.write` |
| `/api/modules/administration/contracts*` | GET | `administration.contracts.access` |
| `/api/modules/administration/contracts*` | POST/PUT | `administration.contracts.write` |
| `/api/modules/administration/contracts*` | DELETE | `administration.contracts.delete` |
| `/api/modules/work/projects*` | GET | `work.projects.access` + module enabled + 项目对象级过滤 |
| `/api/modules/work/projects*` | POST/PUT | `work.projects.write` + module enabled + 项目对象级写入校验 |
| `/api/modules/work/projects*` | DELETE | `work.projects.delete` + module enabled + 项目对象级删除校验 |
| `/api/modules/work/projects/members*` | GET/POST/PUT/DELETE | `work.projects` 对应动作 + module enabled + 项目对象级管理校验 |
| `/api/modules/work/projects/reference-options` | GET | `work.projects.access` + module enabled；项目 FK 候选由 Work service 按对象可见性过滤 |
| `/api/settings/api/open/*` | GET | `settings.api.access` |
| `/api/settings/api/open/*` | POST/PUT | `settings.api.write` |

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
