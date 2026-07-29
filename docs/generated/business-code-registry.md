# 业务编码对象与系统模板

> 此文件由 `npm run business-code:docs` 从 canonical registry 生成，请勿手工编辑。

## 编码对象

| 对象键 | 名称 | Owner | 后端适配 | 默认模板 | 实现入口 |
|---|---|---|---|---|---|
| `hr.employee` | 员工编码 | hr | sequential | `system.sequential` | `packages/hr/server/employees.ts` |
| `hr.organization` | 组织编码 | hr | organization | `system.organization` | `packages/hr/server/domain/department-validation.ts`<br>`packages/hr/utils/department-code-cascade.ts` |
| `hr.position` | 岗位编码 | hr | position | `system.position` | `packages/hr/ui/tabs/department-position/utils.ts` |
| `external.customer` | 客户编码 | external | sequential | `system.sequential` | `packages/external/server/external-party-service.ts` |
| `external.supplier` | 供应商编码 | external | sequential | `system.sequential` | `packages/external/server/external-party-service.ts` |
| `work.project` | 项目编码 | work | project | `system.project` | `packages/work/server/project-normalization.ts` |
| `finance.asset` | 财务资产编码 | finance | financeAsset | `system.financeAsset` | `packages/finance/server/assets/asset-code-allocation.ts` |

## 系统模板

| 模板键 | 名称 | 规则分支 | 示例 | 说明 |
|---|---|---:|---|---|
| `system.sequential` | 通用流水 | 1 | `CODE-00001` | 固定文本与末尾流水。 |
| `system.yearSequence` | 年度流水 | 1 | `CODE-26-00001` | 固定文本、生成年度和末尾流水。 |
| `system.dateSequence` | 日期流水 | 1 | `CODE-260729-00001` | 固定文本、生成日期和末尾流水。 |
| `system.datetimeSequence` | 时间流水 | 1 | `CODE-260729150806-00001` | 固定文本、生成完整时间和末尾流水。 |
| `system.organization` | 组织分层 | 4 | `FUN-001` | 同一模板按组织体系和层级匹配四条规则。 |
| `system.position` | 组织岗位 | 1 | `GW-FUN-001-01` | 岗位固定文本、直属组织编码和部门内流水。 |
| `system.project` | 年度项目 | 3 | `PRJ-26-001` | 按公司、部门和其他项目匹配三条年度流水规则。 |
| `system.financeAsset` | 财务资产 | 1 | `02-FA-ELECTRONIC-2026-00001` | 公司、资产分类、账期年度和固定五位流水。 |
