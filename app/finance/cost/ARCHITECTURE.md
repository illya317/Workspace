# Finance Cost 模块架构说明

## 1. 数据分层

### raw JSON
- 位置：`/Users/koito/Desktop/.财务数据库/成本分析飞书实验版/json/raw`
- 用途：保留 Excel 原始结构，用于审计、排查、重新转换
- **不直接进业务 UI，不导入 DB**

### normalized JSON
- 位置：`/Users/koito/Desktop/.财务数据库/成本分析飞书实验版/json/normalized`
- 用途：作为导入 DB 的中间数据，保留了原始 sheet/row 追溯信息
- **不是最终 DB schema**，需要 agent 判断哪些是事实字段、哪些是计算字段

### DB
只保存：
- 原始业务事实（人工录入值）
- 关联关系（importId → FinanceDataImport）
- 源文件追溯信息（sourceFile / sourceSheet / sourceRow）
- 必要的导入记录（FinanceDataImport）

不保存：
- 小计、合计、百分比、同比、环比
- Excel 里由其他列算出来的金额
- 纯 UI 展示字段
- 可以稳定通过服务层实时计算出来的字段

### Service 计算层
- 位置：`server/services/finance-cost/`
- 负责：汇总金额、成本率、毛利、单位成本、趋势、分组统计

## 2. Schema 说明

| Model | 说明 |
|-------|------|
| `FinanceDataImport` | 导入批次记录，关联各事实表 |
| `FinanceShipment` | 发货事实：客户、产品、数量、金额、回款 |
| `FinanceSalesSalary` | 业务员工资事实：基本工资、提成、实发 |
| `FinanceCostStructureRow` | 成本构成事实：产品、类别、项目、金额、数量 |
| `FinanceCostAnalysisRow` | 成本分析指标行：表名、行标签、指标键、数值 |
| `FinanceWorkshopReport` | 车间报表事实：产品、批号、人员、工种、工分 |

## 3. 计算字段在哪里算

| 指标 | 计算位置 |
|------|---------|
| 未回款 | `shipments.ts`: `amount - receivedAmount` |
| 回款率 | `shipments.ts`: `receivedAmount / amount` |
| 毛利 | `summary.ts`: `shipments.totalAmount - costStructure.totalAmount` |
| 毛利率 | `summary.ts`: `grossProfit / shipments.totalAmount` |
| 单位成本 | `cost-structure.ts`: `totalAmount / totalQuantity` |
| 排行 | 各 service 汇总后排序 |

## 4. 导入脚本

```bash
node scripts/import-finance-cost-json.mjs --dry-run
node scripts/import-finance-cost-json.mjs
```

逻辑：
1. 遍历 `normalized/` 下各 profile 目录
2. 按 profile 解析 JSON，只提取事实字段
3. 原始行完整 JSON 存入 `rawPayload`
4. 同 profile/year/sourceFile 重复导入时先清理旧数据（Cascade）

## 5. API 权限规则

| 端点 | 权限守卫 |
|------|---------|
| GET /api/finance/cost/* | `withFinanceCostAccess` |
| POST /api/finance/cost/imports | `withFinanceCostWrite` |
| DELETE /api/finance/cost/imports/[id] | `withFinanceCostDelete` |

RBAC 资源：
- `finance.cost` — 成本管理总权限
- `finance.cost.shipments` / `.analysis` / `.structure` / `.workshop` / `.salary` / `.imports`

父资源 `finance` 的 access/write/delete 自动覆盖子资源。

## 6. UI Tab 对应数据表

| Tab | 数据表 | API |
|-----|--------|-----|
| 总览 | 全部（service 汇总计算） | `/api/finance/cost/summary` |
| 发货与回款 | `FinanceShipment` | `/api/finance/cost/shipments` |
| 成本分析 | `FinanceCostAnalysisRow` | `/api/finance/cost/cost-analysis` |
| 成本构成 | `FinanceCostStructureRow` | `/api/finance/cost/cost-structure` |
| 车间工分 | `FinanceWorkshopReport` | `/api/finance/cost/workshop` |
| 业务员工资 | `FinanceSalesSalary` | `/api/finance/cost/sales-salary` |
| 导入记录 | `FinanceDataImport` | `/api/finance/cost/imports` |

## 7. 核心原则

> **DB 存事实，Service 算结果，UI 展示结果，source 负责追溯。**
