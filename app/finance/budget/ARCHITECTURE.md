# Budget 预算管理模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 预算管理 | `/finance/budget` | `page.tsx` → `BudgetClient.tsx` → `BudgetTab.tsx` |

由 `FinanceShell` 统一包裹。

生命周期状态：`workspace-analysis`。预算事实来源以 Workspace 版本表、Excel 导入和外部会计系统数据为准；Workspace 保留预算版本、导入兼容、管理层预算分析和差异解释。

## 页面结构

`BudgetTab` 渲染两个视图切换：

| 视图 | 组件 | 说明 |
|------|------|------|
| 部门费用预算 | DeptBudgetTable + DeptBudgetFilters | 按部门+科目展示12个月预算 |
| 研发费用预算 | RdBudgetTable + RdBudgetFilters | 按项目+科目展示12个月预算 |

顶部有 `BudgetVersionSelector` 版本选择器，可切换不同预算版本。

## 数据模型

### FinanceBudgetVersion（版本头表）

预算版本元数据。每年可存在多个版本，状态为 draft/active/archived。

| 字段 | 类型 | 说明 |
|------|------|------|
| year | Int | 预算年度 |
| companyCode | String? | 公司编码，null 表示集团级 |
| name | String | 版本名称，如 "2026年初预算" |
| status | String | draft \| active \| archived |
| type | String | dept \| rd \| all，本版本包含的预算类型 |
| sourceFile | String? | 来源文件名 |
| createdBy | Int? | 创建人 userId |

约束：同 (year, companyCode) 下只有一个 active 版本。DB 层通过 `idx_active_budget_version` partial unique index 强制执行。

### FinanceBudgetDept（部门费用预算事实表）

| 字段 | 类型 | 说明 |
|------|------|------|
| versionId | Int | 所属版本 FK（required） |
| year | Int | 预算年度 |
| companyCode | String? | 公司编码 |
| dept | String | 部门名称 |
| accountName | String | 科目名称 |
| expenseType | String | 费用类型 |
| accountId | Int? | 关联 FinanceAccount FK |
| month1-month12 | Float | 各月预算金额 |
| sourceFile | String? | 来源文件 |

`@@unique([versionId, dept, accountName])` — 同一版本内部门+科目唯一。

### FinanceBudgetRd（研发费用预算事实表）

| 字段 | 类型 | 说明 |
|------|------|------|
| versionId | Int | 所属版本 FK（required） |
| year | Int | 预算年度 |
| companyCode | String? | 公司编码 |
| project | String | 项目名称 |
| category | String | 科目/费用类别 |
| accountId | Int? | 关联 FinanceAccount FK |
| month1-month12 | Float | 各月预算金额 |
| sourceFile | String? | 来源文件 |

`@@unique([versionId, project, category])` — 同一版本内项目+类别唯一。

## 数据流

1. Excel 预算文件位于 `prisma/seed-data/预算/`（部门费用预算数据.xlsx、研发费用预算数据.xlsx）
2. 首次使用 POST `/api/finance/budget` 导入时，系统：
   - 创建 draft 版本 `FinanceBudgetVersion`
   - 解析 Excel，按 versionId 写入 `FinanceBudgetDept` / `FinanceBudgetRd`
   - 返回创建的版本信息
3. 用户在 BudgetTab 中选择版本查看
4. 激活版本：POST `/api/finance/budget/versions/{id}/activate`
   - 自动将同 (year, companyCode) 下其他 active 版本归档
   - 被激活的版本状态变为 active
5. 查询预算数据时：
   - 优先按指定 versionId 查询
   - 未指定时查找 active version
   - 没有任何版本时才 fallback 到 Excel（兼容旧行为）

## API 规范

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/finance/budget` | GET | 查询预算数据，支持 `?versionId=` | `finance.budget.access` |
| `/api/finance/budget` | POST | 导入 Excel 预算，创建 draft 版本 | `finance.budget.write` |
| `/api/finance/budget/versions` | GET | 版本列表，支持 `?year=` | `finance.budget.access` |
| `/api/finance/budget/versions` | POST | 手动创建空版本 | `finance.budget.write` |
| `/api/finance/budget/versions/{id}/activate` | POST | 激活版本，自动归档旧版本 | `finance.budget.write` |

## 计算规则

- **月合计**：service 层从 `month1`..`month12` 计算，不存储派生字段
- **筛选统计**：前端 `useBudgetFilters` hook 从已加载数据中实时计算
- **预算 vs 实际**：由 `/finance/analysis` 页面通过 `budget-analysis.ts` service 读取 active version 聚合数据

## 权限

| 页面 | 需要的权限字段 |
|------|----------------|
| `/finance/budget` | `requireResourceAccess("finance.budget")` |
| 导入/激活/创建版本 | API: `withFinanceBudgetWrite` |
