# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务首页 | `/finance` | `page.tsx` → `FinanceHomeClient.tsx` |
| 总账基础 | `/finance/ledger` | `ledger/page.tsx` → `LedgerClient.tsx` |
| 财务报表 | `/finance/statements` | `statements/page.tsx` → `StatementsClient.tsx` |
| 预算管理 | `/finance/budget` | `budget/page.tsx` → `BudgetClient.tsx` |
| 成本管理 | `/finance/cost` | `cost/page.tsx` → `FinanceCostClient.tsx` |
| 财务分析 | `/finance/analysis` | `analysis/page.tsx` → `FinanceAnalysisClient.tsx` |
| 数据导入 | `/finance/import` | `import/page.tsx` → `ImportClient.tsx` |

所有页面由 `FinanceShell` 统一包裹，提供顶部导航栏、Logo、返回入口及用户菜单。

## 页面结构

### 财务首页 (`/finance`)

`FinanceHomeClient` 渲染模块入口卡片与状态概览：

| 模块 | 说明 |
|------|------|
| 总账基础 | 科目设置、凭证明细、余额表、期间管理 |
| 财务报表 | 资产负债表、利润表、现金流量表 |
| 预算管理 | 部门费用预算、研发费用预算 |
| 财务分析 | 预算执行分析、差异分析、趋势看板 |
| 成本管理 | 生产成本、发货、成本构成、车间工分 |

### 总账基础 (`/finance/ledger`)

`LedgerClient` 渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目管理 | AccountTab | 会计科目 CRUD |
| 凭证明细 | VoucherTab | 凭证录入/查询 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算、外部余额表校准 |

### 财务报表 (`/finance/statements`)

`StatementsClient` 渲染：

| Tab | 组件 | 说明 |
|-----|------|------|
| 财务报表 | ReportTab | 资产负债表/利润表 |

### 预算管理 (`/finance/budget`)

`BudgetClient` 渲染：

| Tab | 组件 | 说明 |
|-----|------|------|
| 预算 | BudgetTab | 部门费用预算、研发费用预算 |

### 成本管理（子模块）

详见 `app/finance/cost/ARCHITECTURE.md`。

## 核心组件链

```
page.tsx
  └─ FinanceShell
       └─ FinanceHomeClient.tsx

ledger/page.tsx
  └─ FinanceShell
       └─ LedgerClient.tsx
            ├─ AccountTab.tsx
            ├─ VoucherTab.tsx
            └─ LedgerTab.tsx

statements/page.tsx
  └─ FinanceShell
       └─ StatementsClient.tsx
            └─ ReportTab.tsx

budget/page.tsx
  └─ FinanceShell
       └─ BudgetClient.tsx
            └─ BudgetTab.tsx
```

## 数据流

1. 各 Tab 组件独立管理自身状态，通过 API 加载数据
2. 财务数据以 `Period`（会计期间）为核心维度
3. 年度余额表来自会计软件，导入后存为 `FinanceBalanceSnapshot`（批次）+ `FinanceBalanceSnapshotRow`（明细）
4. 月度余额 `FinanceAccountBalance` 由系统从 active baseline snapshot + 已过账序时账凭证逐月滚动计算
5. 上传后续年度余额表做校准时，系统比较"基准+序时账滚动结果"和会计软件年度余额表，只做校准对比，不覆盖月度余额

## 余额表口径

余额表分三层：

| 层 | 表 | 来源 | 用途 |
|---|---|---|---|
| 年度余额批次 | `FinanceBalanceSnapshot` | 一次外部会计软件导入 = 一行 | 追溯哪次导入、哪个文件、谁导入 |
| 年度余额明细 | `FinanceBalanceSnapshotRow` | 导入时每个科目的原始行 | 保存 `accountCode`/`accountName` 快照，审计可追溯到 Excel 原始行 |
| 月度余额结果 | `FinanceAccountBalance` | 系统计算 | 按月展示、报表取数 |

计算规则：

1. 导入 2024 年度余额表后，**只写入 `FinanceBalanceSnapshot` + `FinanceBalanceSnapshotRow`**，`snapshotType="baseline"`, `isActive=true`。
2. 后续年度余额表（2025+）导入时默认 `snapshotType="reconcile"`, `isActive=false`，仅用于校准核对。
3. 点击余额表"重新计算"时，系统从 active baseline snapshot 的 closing balance 开始，叠加已过账凭证逐月滚动到 `FinanceAccountBalance`。
4. `FinanceAccountBalance` 是 `FinanceBalanceSnapshotRow` 的 materialized 缓存/展示层，不是数据源头。
5. 换基准年份：将某个 reconcile snapshot 改为 `snapshotType="baseline"` + `isActive=true`（同 companyCode+year 下只有一个 active），然后重算受影响月份。
6. 删除 active baseline：必须先选择新的 baseline。删除普通 reconcile snapshot 可直接级联删除。## 重分类系统

重分类工作流将凭证明细中"借贷方向与科目自然余额方向相反"的分录，重新归类到对应目标科目，以消除资产负债表中的虚增余额。

### 数据模型

| 表 | 文件 | 说明 |
|---|---|---|
| `FinanceReclassRule` | `prisma/models/finance-ledger.prisma` | 科目级规则：`(companyCode, year, sourceAccountCode, abnormalSide)` → `targetAccountCode` |
| `ReclassResult` | `prisma/models/finance-schedules.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空追溯到规则 |

### 规则表 (`FinanceReclassRule`)

- `companyCode` **非空**，规则总是公司作用域
- `@@unique([companyCode, year, sourceAccountCode, abnormalSide])` 确保唯一
- `abnormalSide`: `debit` 表示贷余科目的异常借方（需重分类到资产方），`credit` 表示借余科目的异常贷方（需重分类到负债方）
- `source`: `"manual"` 为用户手动配置，`"suggested"` 为系统候选（Batch 2+）
- 替代 `FinanceAccount.reclassTargetCode`（兼容字段，Batch 8 清理）

### 结果表 (`ReclassResult`)

- `@@unique([periodId, voucherItemId])` 确保同一明细只有一条结果
- `ruleId` (Int?) 追溯到生成此结果的 `FinanceReclassRule`；手工添加或历史兼容时为 null
- `status`: `pending` → `approved` | `adjusted` | `rejected`（终态不可逆）
- `approved` / `adjusted` 结果被资产负债表消费；`pending` / `rejected` 不参与报表

### 兼容过渡

- Batch 1: 新表落位，引擎继续读 `FinanceAccount.reclassTargetCode`，`ReclassResult.ruleId` 为 null
- Batch 4: 引擎切换到 `FinanceReclassRule`
- Batch 8: 清理 `FinanceAccount.reclassTargetCode`


## 预算管理

详见 `app/finance/budget/ARCHITECTURE.md`。

预算数据来自 `prisma/seed-data/预算/` 下的 Excel 文件（部门费用预算、研发费用预算）。

`FinanceBudgetVersion` 为版本头表（draft/active/archived），`FinanceBudgetDept` / `FinanceBudgetRd` 为事实表，通过 `versionId` 关联到版本。`accountId` 外键关联到 `FinanceAccount`。

### 预算导入

```bash
# 将 Excel 预算数据导入数据库（创建 draft 版本）
curl -X POST /api/finance/budget -H "Content-Type: application/json" -d '{"year":2026}'
```

### 预算科目同步脚本

```bash
npm run budget:sync-accounts
```

该脚本读取两份预算 Excel，将预算中未出现在 `FinanceAccount` 的科目创建为 `isActive=false` 的占位科目（编码格式 `BUDGET-{DEPT|RD}-###`）。**需在预算 Excel 变更后重新运行，然后重新导入预算到数据库**。

## API 规范

| 端点 | 说明 |
|------|------|
| `GET/POST/PUT/DELETE /api/finance/accounts` | 会计科目 |
| `GET/POST/PUT/DELETE /api/finance/vouchers` | 凭证管理 |
| `GET/POST /api/finance/balances` | 月度余额查询/按年度基准重新计算 |
| `POST /api/finance/balances/reconcile` | 上传会计软件年度余额表进行校准核对 |
| `GET/PUT /api/finance/periods` | 会计期间 |
| `GET /api/finance/reports` | 财务报表 |
| `GET /api/finance/init` | 财务初始化 |
| `GET/POST/DELETE /api/finance/cost/*` | 成本管理子模块 |

## 权限标准

### 资源键

| 资源 | 键 | 说明 |
|------|-----|------|
| 财务根 | `finance` | 旧统一入口，现退化为"任一财务子权限"的汇总标识 |
| 总账基础 | `finance.ledger` | 科目、凭证、余额、期间、初始化 |
| 财务报表 | `finance.statement` | 资产负债表、利润表、现金流量表 |
| 预算管理 | `finance.budget` | 部门费用预算、研发费用预算 |
| 财务分析 | `finance.analysis` | 预算执行分析、差异分析、趋势看板 |
| 数据导入 | `finance.import` | 科目表、序时账、余额表导入 |
| 成本管理 | `finance.cost` | 生产成本、发货、成本构成、车间工分 |

每个资源支持 `access` / `write` / `delete` 三个动作（成本子资源另有 `shipments` / `analysis` / `structure` / `workshop` / `salary` / `imports` 细分）。

### 权限继承规则

- 父资源 `finance.access` 自动覆盖所有子资源的 `access`。
- 子资源 checker 的实现顺序：先查子资源权限，未命中再回退到父资源 `finance.*`。
- 例：只授予 `finance.budget.access` 的用户，可以进入 `/finance/budget`，也可以通过 `/finance` 首页和 Portal 入口（`canAccessFinance` 在 session 层聚合了所有子权限）。

### 页面 Guard

| 页面 | 需要的权限字段 |
|------|----------------|
| `/finance` | `canAccessFinance`（任一财务子权限） |
| `/finance/ledger` | `canAccessFinanceLedger` |
| `/finance/statements` | `canAccessFinanceReport` |
| `/finance/budget` | `canAccessFinanceBudget` |
| `/finance/analysis` | `canAccessFinanceAnalysis` |
| `/finance/import` | `canAccessFinanceImport` |
| `/finance/cost` | `canAccessFinanceCost` |

### API Guard Wrapper

| API | Wrapper | 说明 |
|-----|---------|------|
| `/api/finance/accounts*` | `withFinanceLedgerAccess/Write/Delete` | 科目管理 |
| `/api/finance/vouchers*` | `withFinanceLedgerAccess/Write/Delete` | 凭证管理 |
| `/api/finance/balances*` | `withFinanceLedgerAccess/Write` | 余额查询/重算/校准 |
| `/api/finance/periods*` | `withFinanceLedgerAccess/Write/Delete` | 会计期间 |
| `/api/finance/init` | `withFinanceLedgerWrite` | 财务初始化 |
| `/api/finance/reports` | `withFinanceReportAccess` | 报表生成 |
| `/api/finance/budget` | `withFinanceBudgetAccess/Write` | 预算查询/导入 |
| `/api/finance/import/preview` | `withFinanceImportAccess` | 导入预览（非变更操作，用 Access） |
| `/api/finance/import/confirm` | `withFinanceImportWrite` | 导入确认（写入数据库，用 Write） |
| `/api/finance/cost/*` | `withFinanceCostAccess/Write/Delete` | 成本子模块 |
