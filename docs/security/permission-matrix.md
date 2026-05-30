# 权限矩阵

> 每个资源的 `access` / `write` / `delete` / `admin` 预期行为。后续可转为 Playwright / API 测试。

## 资源清单

| 资源 key | SessionUser 字段 | 动作 |
|----------|-----------------|------|
| `people` | `canAccessHR / canEditHR / canDeleteHR` | access, write, delete, admin |
| `finance` | `canAccessFinance` | access, write, delete, admin |
| `finance.ledger` | `canAccessFinanceLedger` | access, write, delete |
| `finance.statement` | `canAccessFinanceReport` | access |
| `finance.budget` | `canAccessFinanceBudget` | access, write |
| `finance.analysis` | `canAccessFinanceAnalysis` | access |
| `finance.cost` | `canAccessFinanceCost` | access, write, delete |
| `finance.import` | `canAccessFinanceImport` | access (preview), write (confirm) |
| `inventory` | `canAccessInventory` | access, write, delete |
| `contract` | `canAccessContract` | access, write, delete |
| `work` | `canAccessWorks` | access, write |
| `system` | `canAccessAdmin / canManagePermissions` | admin |

## 页面 Guard

| 页面 | 权限检查 | 无权限行为 |
|------|---------|-----------|
| `/portal` | 无（入口页） | — |
| `/hr` | `canAccessHR` | redirect `/portal` |
| `/hr/roster` | `canAccessHR` | redirect `/portal` |
| `/hr/performance` | `canAccessHR` | redirect `/portal` |
| `/hr/analytics` | `canAccessHR` | redirect `/portal` |
| `/finance` | `canAccessFinance` | redirect `/portal` |
| `/finance/ledger` | `canAccessFinanceLedger` | — |
| `/finance/statements` | `canAccessFinanceReport` | — |
| `/finance/budget` | `canAccessFinanceBudget` | — |
| `/finance/analysis` | `canAccessFinanceAnalysis` | — |
| `/finance/cost` | `canAccessFinanceCost` | — |
| `/finance/import` | `canAccessFinanceImport` | — |
| `/administration` | 无 | — |
| `/contracts` | `canAccessContract` | redirect `/portal` |
| `/production` | `canAccessInventory` | redirect `/portal` |
| `/inventory` | `canAccessInventory` | redirect `/portal` |
| `/reports` | 无 | — |
| `/docs` | 无 | — |

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
| `/api/inventory/*` | GET | `inventory.access` |
| `/api/inventory/*` | POST/PUT | `inventory.write` |
| `/api/contracts*` | GET | `contract.access` |
| `/api/contracts*` | POST/PUT | `contract.write` |
| `/api/contracts*` | DELETE | `contract.delete` |

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- `system.admin` 覆盖所有资源的所有动作
- 子资源 checker 先查子资源，未命中回退父资源
