# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务首页 | `/finance` | `page.tsx` → `FinanceHomeClient.tsx` |
| 总账会计 | `/finance/ledger` | `ledger/page.tsx` → `LedgerClient.tsx` |
| 财务报表 | `/finance/statements` | `statements/page.tsx` → `StatementsClient.tsx` |
| 管理会计 | `/finance/analysis` | `analysis/page.tsx` → `FinanceAnalysisClient.tsx` |
| 预算管理 | `/finance/budget` | `budget/page.tsx` → `BudgetClient.tsx` |
| 成本管理 | `/finance/cost` | `cost/page.tsx` → `FinanceCostClient.tsx` |
| 税务管理 | `/finance/tax` | `tax/page.tsx` (占位) |
| 司库管理 | `/finance/treasury` | `treasury/page.tsx` (占位) |
| 数据导入与治理 | `/finance/import` | `import/page.tsx` → `ImportClient.tsx` |

所有页面由 `FinanceShell` 统一包裹，提供顶部导航栏、Logo、返回入口及用户菜单。

## 页面结构

### 财务首页 (`/finance`)

`FinanceHomeClient` 渲染模块入口卡片与状态概览：

| 模块 | 说明 |
|------|------|
| 总账会计 | 科目、凭证、期间、余额、结账、重分类 |
| 财务报表 | 资产负债表、利润表、现金流量表、取数明细 |
| 管理会计 | 经营分析、部门利润、产品客户维度、预算执行分析 |
| 预算管理 | 预算版本、部门预算、研发预算、调整、执行 |
| 成本管理 | 发货、成本结构、成本分析、车间工分、销售工资 |
| 税务管理 | 销项/进项、税负、发票、纳税申报（规划中） |
| 司库管理 | 银行账户、资金日报、收付款、现金流（规划中） |
| 数据导入与治理 | 科目/凭证/余额/预算/成本导入，校验与异常 |

### 总账会计 (`/finance/ledger`)

`LedgerClient` 渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目设置 | AccountTab | 会计科目 CRUD |
| 凭证明细 | VoucherTab | 凭证录入/查询/重分类审核 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算、外部余额表校准 |
| 重分类表 | ReclassTab | 重分类结果汇总只读视图（从附注明细迁入） |
| 资产折旧 | — | 资产折旧表（开发中） |

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
            ├─ LedgerTab.tsx
            ├─ ReclassTab.tsx
            └─ (折旧表, 占位)

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
| `FinanceReclassRule` | `prisma/models/finance-ledger.prisma` | 科目规则：`(companyCode, year, sourceAccountCode, abnormalSide)` → `targetAccountCode` |
| `FinanceReclassItemRule` | `prisma/models/finance-ledger.prisma` | 明细例外规则：`(companyCode, year, sourceAccountCode, matchType, matchValue)` → `targetAccountCode` |
| `ReclassResult` | `prisma/models/finance-ledger.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空 |

### 规则表 (`FinanceReclassRule`)

- `companyCode` **非空**，规则总是公司作用域
- `@@unique([companyCode, sourceAccountCode, abnormalSide])` 公司级唯一
- `year`: nullable，首次配置/候选扫描来源年份，仅追溯
- `abnormalSide`: `debit` = 异常借方、`credit` = 异常贷方、`both` = 全部重分类
- `source`: `"manual"` 手动配置、`"auto"` 系统自动确认、`"suggested"` 系统候选

### 结果表 (`ReclassResult`)

- `@@unique([periodId, voucherItemId])` 确保同一明细只有一条结果
- `ruleId` (Int?) 追溯到生成此结果的 `FinanceReclassRule`；手工添加或历史兼容时为 null
- `status`: 默认 `approved`（系统自动通过），`adjusted`（人工调整，受保护不被覆盖），`pending`（待审核），`rejected`（不参与报表）
- `approved` / `adjusted` 被报表消费；`pending` / `rejected` 不参与

### 端到端数据流

```
┌─ 配置规则 ──────────────────────────────────────────────┐
│ 科目设置 → 重分类规则 scope                              │
│   GET /api/finance/reclass-rules?companyCode=&year=       │
│   调用 scanCandidates() 扫描凭证明细异常方向               │
│   PUT /api/finance/reclass-rules → FinanceReclassRule     │
│   DELETE /api/finance/reclass-rules/[id]                  │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 生成结果 ──────────────────────────────────────────────┐
│ 凭证明细 → 生成重分类结果 按钮                            │
│   POST /api/finance/reclass-results { periodId }          │
│   调用 buildReclassResults() → upsert ReclassResult       │
│   引擎读 FinanceReclassRule + FinanceReclassItemRule      │
│   匹配异常方向凭证明细 → 生成 approved ReclassResult       │
│   只保护 adjusted/rejected，approved/pending 可覆盖        │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 审核 ──────────────────────────────────────────────────┐
│ 凭证明细 → 重分类核查 scope / 展开凭证内联                │
│   PATCH /api/finance/reclass-results/[id]                │
│   approve / mark_pending / adjust                         │
│   正常分录 → 待审核 → pending ReclassResult                │
│   pending → 确认 → approved                               │
│   approved → 待审核 → pending                             │
│   adjust → adjusted + 沉淀 FinanceReclassItemRule         │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 报表消费 (只读) ───────────────────────────────────────┐
│ /api/finance/reports → generateReport()                   │
│   查询 ReclassResult WHERE status IN (approved, adjusted)  │
│   reclassifyFromEntries() 构建 deductions + additions     │
│   按 sourceAccount 扣减 → 按 targetAccount 增加           │
│   资产负债表 reclassLine() 统一应用 src+tgt 路由          │
└──────────────────────────────────────────────────────────┘
```

### 报表消费口径

- **只消费** `status IN ("approved", "adjusted")`，不消费 `pending` / `rejected`
- 按 `sourceAccount` 前缀扣减对应资产负债表行（资产 1xxx 扣贷方，负债 2xxx 扣借方）
- 按 `targetAccount` 前缀增加到对应资产负债表行
- `ReclassEntry { sourceAccount, targetAccount, amount }` 精确金额，非整科目余额
- 报表页不触发生成、不编辑规则、不审核结果
- 遗留 `FinanceAccount.reclassTargetCode` 仍保留（Batch 8 清理），引擎已不读


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
| `GET/PUT/DELETE /api/finance/reclass-rules` | 重分类规则管理 |
| `GET/POST/PATCH /api/finance/reclass-results` | 重分类结果列表/生成/审核 |
| `GET/POST/DELETE /api/finance/cost/*` | 成本管理子模块 |

## 权限标准

### 资源键

| 资源 | 键 | 说明 |
|------|-----|------|
| 财务根 | `finance` | 任一财务子权限的汇总标识 |
| 总账会计 | `finance.ledger` | 科目、凭证、余额、期间、重分类、折旧 |
| 财务报表 | `finance.statement` | 资产负债表、利润表、现金流量表 |
| 管理会计 | `finance.analysis` | 经营分析、部门利润、预算执行分析 |
| 预算管理 | `finance.budget` | 部门预算、研发预算、调整、执行 |
| 成本管理 | `finance.cost` | 发货、成本结构、成本分析、车间工分 |
| 税务管理 | `finance.tax` | 销项/进项、税负、发票（规划中） |
| 司库管理 | `finance.treasury` | 银行账户、资金日报、收付款（规划中） |
| 数据导入与治理 | `finance.import` | 科目/凭证/余额/预算/成本导入 |

每个资源支持 `access` / `write` / `delete` 三个动作（成本子资源另有 `shipments` / `analysis` / `structure` / `workshop` / `salary` / `imports` 细分）。

### 权限继承规则

- 父资源 `finance.access` 自动覆盖所有子资源的 `access`。
- 子资源 checker 的实现顺序：先查子资源权限，未命中再回退到父资源 `finance.*`。
- 例：只授予 `finance.budget.access` 的用户，可以进入 `/finance/budget`，也可以通过 `/finance` 首页和 Portal 入口（`canAccessFinance` 在 session 层聚合了所有子权限）。

### 页面 Guard

页面统一使用 `requireResourceAccess(resourceKey)` 做服务端门禁（基于 `visibleResourceKeys`）。

| 页面 | Guard |
|------|-------|
| `/finance` | `requireResourceAccess("finance")` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` |
| `/finance/statements` | `requireResourceAccess("finance.statement")` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` |
| `/finance/tax` | 占位，无门禁 |
| `/finance/treasury` | 占位，无门禁 |
| `/finance/import` | `requireResourceAccess("finance.import")` |

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
| `/api/finance/reclass-rules` | `withFinanceLedgerAccess/Write` | 重分类规则查询/写入 |
| `/api/finance/reclass-results` | `withFinanceLedgerAccess/Write` | 重分类结果列表/生成/审核 |
| `/api/finance/cost/*` | `withFinanceCostAccess/Write/Delete` | 成本子模块 |
