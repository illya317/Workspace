# Prisma Schema 治理规则

## 1. 文件结构

- `prisma/schema.prisma` **只允许**放 `generator` 和 `datasource`。
- 所有 model 必须按领域放在 `prisma/models/*.prisma`。
- 禁止把新 model 直接写回 `prisma/schema.prisma`。

当前领域划分：

| 文件 | 领域 | 模型 |
|------|------|------|
| `auth-rbac.prisma` | 认证与权限 | User, Resource, Role, UserResourceRole, PositionResourceRole, DepartmentResourceRole |
| `system.prisma` | 系统 | SystemConfig, LoginAttempt |
| `reports.prisma` | 工作汇报 | Report, ReportItem, ReportHistory |
| `works.prisma` | 工作清单 | WorkItem, WorkParticipant |
| `hr.prisma` | 人事行政 | Employee, Employment, Company, CompanyRelation, Department, Position, EDP, Project, EmployeeProject, PositionDescription, EditHistory |
| `finance-ledger.prisma` | 财务总账 | FinanceAccount, FinancePeriod, FinanceVoucher, FinanceVoucherItem, FinanceAccountBalance |
| `finance-budget.prisma` | 预算管理 | FinanceBudgetVersion, FinanceBudgetDept, FinanceBudgetRd |
| `finance-cost.prisma` | 成本管理 | FinanceDataImport, FinanceShipment, FinanceSalesSalary, FinanceCostStructureRow, FinanceCostAnalysisRow, FinanceWorkshopReport |
| `inventory.prisma` | 库存管理 | StockRawMaterial, StockPackaging, StockFinishedGoods, StockBatch, StockOperation, StockReturn |
| `contracts.prisma` | 合同管理 | Contract |

## 2. Model 注释规范

每个 model 前必须有 `///` 注释，说明：
- 业务含义
- 数据来源（JSON/手工/导入）
- 是否为事实表

示例：

```prisma
/// 员工基础信息（事实表，来源于 employees.json 导入）
model Employee {
  ...
}
```

## 3. 事实字段原则

- **DB 只存事实字段**：原始输入、状态、时间、金额、数量等不可再拆的基础数据。
- **Service 层计算结果**：合计、百分比、毛利、单位成本、未回款、排名等派生结果禁止存入 DB。
- **UI 展示结果**：前端展示的计算值应从 API/service 获取，不直接读取派生字段。

## 4. Finance Cost 特殊规则

- 所有成本模型必须包含 `sourceFile` / `sourceSheet` / `sourceRow` 追溯字段（或明确说明例外）。
- 禁止把 normalized JSON 原样映射成 DB schema。
- 禁止出现以下派生字段名：`total`, `subtotal`, `ratio`, `rate`, `percent`, `percentage`, `share`, `unitCost`, `grossProfit`, `margin`, `unreceivedAmount`, `remainingAmount`。

## 5. 修改流程

修改 schema 时：
1. 同步更新对应 `ARCHITECTURE.md`：
   - HR → `app/hr/ARCHITECTURE.md`
   - Finance Cost → `app/finance/cost/ARCHITECTURE.md`
2. 运行验证：
   ```bash
   npm run db:validate && npm run schema:check && npx prisma generate && npx tsc --noEmit
   ```
3. 提交前确保 `npm run build` 通过。
