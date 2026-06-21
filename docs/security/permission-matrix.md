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
| `work` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write |
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
| `/work/reports` | `requireResourceAccess("work.report")` | redirect `/portal` |
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
| `/api/inventory/*` | GET/POST/PUT/DELETE | `410 Gone` |
| `/api/modules/administration/contracts*` | GET | `administration.contract.access` |
| `/api/modules/administration/contracts*` | POST/PUT | `administration.contract.write` |
| `/api/modules/administration/contracts*` | DELETE | `administration.contract.delete` |

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- `system.admin` 覆盖所有资源的所有动作
- 子资源 checker 先查子资源，未命中回退父资源
