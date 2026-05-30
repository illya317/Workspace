# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务总账 | `/finance` | `app/finance/page.tsx` → `FinanceClient.tsx` |
| 成本管理 | `/finance/cost` | `app/finance/cost/page.tsx` → `FinanceCostClient.tsx` |
| 财务分析 | `/finance/analysis` | `app/finance/analysis/page.tsx` → `FinanceAnalysisClient.tsx` |

## 页面结构

### 财务总账 Tab

FinanceClient 渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目管理 | AccountTab | 会计科目 CRUD |
| 凭证明细 | VoucherTab | 凭证录入/查询 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算、外部余额表校准 |
| 财务报表 | ReportTab | 资产负债表/利润表 |

### 成本管理（子模块）

详见 `app/finance/cost/ARCHITECTURE.md`。

## 核心组件链

```
page.tsx
  └─ FinanceClient.tsx
       ├─ AccountTab.tsx
       ├─ VoucherTab.tsx
       ├─ LedgerTab.tsx
       └─ ReportTab.tsx
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
6. 删除 active baseline：必须先选择新的 baseline。删除普通 reconcile snapshot 可直接级联删除。


## 预算管理

预算数据来自 `prisma/seed-data/预算/` 下的 Excel 文件（部门费用预算、研发费用预算）。

`FinanceBudgetDept` 和 `FinanceBudgetRd` 两张事实表持久化预算数据，`accountId` 外键关联到 `FinanceAccount`。`GET /api/finance/budget` 优先从数据库读取，无数据时回退到 Excel。

### 预算导入

```bash
# 将 Excel 预算数据导入数据库（建立真 FK）
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

- `finance.access` — 查看财务数据
- `finance.write` — 录入/编辑凭证、科目
- `finance.delete` — 删除凭证/科目
- `finance.cost.access` — 成本管理查看
- `finance.cost.write` — 成本数据导入/编辑
- `finance.cost.delete` — 成本数据删除

父资源权限自动覆盖子资源（如 `finance.access` 覆盖 `finance.cost.access`）。
