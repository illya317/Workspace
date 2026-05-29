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
| 余额表 | LedgerTab | 科目余额表查询 |
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
3. **Service** `server/services/finance/` 处理财务计算（余额、汇总等）

## API 规范

| 端点 | 说明 |
|------|------|
| `GET/POST/PUT/DELETE /api/finance/accounts` | 会计科目 |
| `GET/POST/PUT/DELETE /api/finance/vouchers` | 凭证管理 |
| `GET /api/finance/balances` | 余额查询 |
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
