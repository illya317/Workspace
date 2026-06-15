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
| `system.erpnext` | `manageableResourceKeys` | admin |

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
| `/contracts` | `requireResourceAccess("administration.contract")` | redirect `/portal` |
| `/production` | `requireResourceAccess("production")` | redirect `/portal` |
| `/inventory` | 旧库存入口已关闭 | redirect `/production` |
| `/reports` | `requireResourceAccess("work")` | redirect `/portal` |
| `/docs` | `requireResourceAccess("docs")` | redirect `/portal` |

## API Guard

| API | 方法 | 所需权限 |
|-----|------|---------|
| `/api/hr/*` | GET | `people.access` |
| `/api/hr/*` | POST/PUT/PATCH | `people.write` |
| `/api/hr/*` | DELETE | `people.delete` |
| `/api/finance/accounts*` | GET | `finance.ledger.access` |
| `/api/finance/accounts*` | POST/PUT | `finance.ledger.write` |
| `/api/finance/accounts*` | DELETE | `finance.ledger.delete` |
| `/api/finance/vouchers*` | GET | `finance.ledger.access` |
| `/api/finance/vouchers*` | POST/PUT | `finance.ledger.write` |
| `/api/finance/vouchers*` | DELETE | `finance.ledger.delete` |
| `/api/finance/balances*` | GET/POST | `finance.ledger.access` (read/compute) |
| `/api/finance/balances/reconcile` | POST | `finance.ledger.write` (upload + compare) |
| `/api/finance/periods*` | GET/PUT | `finance.ledger.access/write` |
| `/api/finance/init` | POST | `finance.ledger.write` |
| `/api/finance/reports` | GET | `finance.statement.access` |
| `/api/finance/budget` | GET/POST | `finance.budget.access/write` |
| `/api/finance/import/preview` | POST | `finance.import.access` |
| `/api/finance/import/confirm` | POST | `finance.import.write` |
| `/api/finance/cost/*` | GET | `finance.cost.access` |
| `/api/finance/cost/*` | POST/PUT | `finance.cost.write` |
| `/api/finance/cost/*` | DELETE | `finance.cost.delete` |
| `/api/production/qc/config` | GET | `production.qc.access` |
| `/api/production/qc/templates/[templateId]` | GET | `production.qc.templates.access` |
| `/api/inventory/*` | GET/POST/PUT/DELETE | `410 Gone` |
| `/api/contracts*` | GET | `administration.contract.access` |
| `/api/contracts*` | POST/PUT | `administration.contract.write` |
| `/api/contracts*` | DELETE | `administration.contract.delete` |

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- `system.admin` 覆盖所有资源的所有动作
- 子资源 checker 先查子资源，未命中回退父资源
