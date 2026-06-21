# 权限矩阵

> 每个资源的 `access` / `write` / `delete` / `admin` 预期行为。后续可转为 Playwright / API 测试。

## 资源清单

| 资源 key | Session 表达 | 动作 |
|----------|--------------|------|
| `people` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `finance` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `finance.ledger` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `finance.statement` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.budget` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
| `finance.analysis` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access |
| `finance.cost` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `finance.import` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access (preview), write (confirm) |
| `administration.contract` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete |
| `work` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.project` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin（模块门禁，不放大对象范围） |
| `work.project.view_all` | `visibleResourceKeys` | access（独立全量可见资源，`runtimeParentKey=work.project`） |
| `work.task` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.report` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `work.history` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `system` | `manageableResourceKeys` | admin |

## 页面 Guard

| 页面 | 权限检查 | 无权限行为 |
|------|---------|-----------|
| `/portal` | 无（入口页） | — |
| `/hr` | `requireResourceAccess("people")` | redirect `/portal` |
| `/hr/roster` | `requireResourceAccess("people.roster")` | redirect `/portal` |
| `/hr/performance` | `requireResourceAccess("people.performance")` | redirect `/portal` |
| `/hr/analytics` | `requireResourceAccess("people.analytics")` | redirect `/portal` |
| `/finance` | `requireResourceAccess("finance")` | redirect `/portal` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` | redirect `/portal` |
| `/finance/statements` | `requireResourceAccess("finance.statement")` | redirect `/portal` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` | redirect `/portal` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` | redirect `/portal` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` | redirect `/portal` |
| `/finance/import` | `requireResourceAccess("finance.import")` | redirect `/portal` |
| `/administration` | `requireResourceAccess("administration")` | redirect `/portal` |
| `/administration/contracts` | `requireResourceAccess("administration.contract")` | redirect `/portal` |
| `/production` | `requireResourceAccess("production")` | redirect `/portal` |
| 生产库存页面 | 未开放独立页面入口 | 无页面 route |
| `/work` | `requireResourceAccess("work")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/projects` | `requireResourceAccess("work.project")` + module enabled + 项目对象级过滤 | redirect `/portal` 或模块未启用页 |
| `/work/tasks` | `requireResourceAccess("work.task")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/reports` | `requireResourceAccess("work.report")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/history` | `requireResourceAccess("work.history")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/docs` | `requireResourceAccess("docs")` | redirect `/portal` |

## API Guard

| API | 方法 | 所需权限 |
|-----|------|---------|
| `/api/modules/hr/*` | GET | `people.access` |
| `/api/modules/hr/*` | POST/PUT/PATCH | `people.write` |
| `/api/modules/hr/*` | DELETE | `people.delete` |
| `/api/modules/finance/accounts*` | GET | `finance.ledger.access` |
| `/api/modules/finance/accounts*` | POST/PUT | `finance.ledger.write` |
| `/api/modules/finance/accounts*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/vouchers*` | GET | `finance.ledger.access` |
| `/api/modules/finance/vouchers*` | POST/PUT | `finance.ledger.write` |
| `/api/modules/finance/vouchers*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/balances*` | GET/POST | `finance.ledger.access` (read/compute) |
| `/api/modules/finance/balances/reconcile` | POST | `finance.ledger.write` (upload + compare) |
| `/api/modules/finance/periods*` | GET/PUT | `finance.ledger.access/write` |
| `/api/modules/finance/init` | POST | `finance.ledger.write` |
| `/api/modules/finance/reports` | GET | `finance.statement.access` |
| `/api/modules/finance/budget` | GET/POST | `finance.budget.access/write` |
| `/api/modules/finance/import/preview` | POST | `finance.import.access` |
| `/api/modules/finance/import/confirm` | POST | `finance.import.write` |
| `/api/modules/finance/cost/*` | GET | `finance.cost.access` |
| `/api/modules/finance/cost/*` | POST/PUT | `finance.cost.write` |
| `/api/modules/finance/cost/*` | DELETE | `finance.cost.delete` |
| `/api/modules/production/qc/config` | GET | `production.qc.access` |
| `/api/modules/production/qc/templates/[templateId]` | GET | `production.qc.templates.access` |
| `/api/modules/production/qc/template-feedback` | GET | `production.qc.templates.access` |
| `/api/modules/production/qc/template-feedback` | POST | `production.qc.templates.write` |
| `/api/modules/production/qc/batches` | GET | `production.qc.batches.access` |
| `/api/modules/production/qc/batches` | POST | `production.qc.batches.write` |
| `/api/modules/production/qc/batches/[batchId]` | GET | `production.qc.batches.access` |
| `/api/modules/production/qc/batches/[batchId]` | PATCH | `production.qc.batches.write` |
| `/api/modules/production/qc/batches/[batchId]` | DELETE | `production.qc.batches.delete` |
| `/api/modules/production/qc/batches/[batchId]/submit` | POST | `production.qc.batches.write` |
| `/api/modules/production/inventory/*` | GET/POST/PUT/DELETE | `410 Gone` |
| `/api/modules/administration/contracts*` | GET | `administration.contract.access` |
| `/api/modules/administration/contracts*` | POST/PUT | `administration.contract.write` |
| `/api/modules/administration/contracts*` | DELETE | `administration.contract.delete` |
| `/api/modules/work/projects*` | GET | `work.project.access` + module enabled + 项目对象级过滤 |
| `/api/modules/work/projects*` | POST/PUT | `work.project.write` + module enabled + 项目对象级写入校验 |
| `/api/modules/work/projects*` | DELETE | `work.project.delete` + module enabled + 项目对象级删除校验 |
| `/api/modules/work/project-members*` | GET/POST/PUT/DELETE | `work.project` 对应动作 + module enabled + 项目对象级管理校验 |
| `/api/modules/work/reference-options` | GET | `work.project.access` + module enabled；项目 FK 候选由 Work service 按对象可见性过滤 |

## Work Project 对象级范围

- `work.project.access/write/delete` 只控制项目模块入口和发起能力，不代表查看全部、管理全部或删除全部项目。
- 项目可见范围由创建人、主导部门负责人、项目 RASCI 成员、显式 `work.project.view_all` 和 system admin 共同决定。
- `work.project.view_all` 只授予全量可见，不授予全量管理或删除；需要管理/删除具体项目仍按对象级规则计算。
- `work.project.view_all` 不挂 `parentKey`，因此不会继承 `work.project` 模块权限；它通过 `runtimeParentKey` 跟随 `work.project` disabled。
- `work` 或 `work.project` disabled 后，模块入口、页面、API、FK 暴露和 `work.project.view_all` 一起失效。

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- `system.admin` 覆盖所有资源的所有动作
- 子资源 checker 先查子资源，未命中回退父资源
- `runtimeParentKey` 不参与 RBAC 继承，只参与模块运行态 enabled/disabled 级联。
