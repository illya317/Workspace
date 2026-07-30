# Budget 预算管理模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 预算管理 | `/finance/budget` | `page.tsx` → `@workspace/finance/ui` 的 `BudgetTab` |

`app/(modules)/finance/budget/page.tsx` 只做鉴权、用户预取和挂载 `FinanceShell`/`BudgetTab`。预算页面真实 UI、hooks 和局部组件位于 `packages/finance/ui/budget/*`。

生命周期状态：`workspace-owned`。预算运行时事实只来自 Workspace 数据库版本；Excel 仅作为私有一次性 data release 输入，不进入网页 API 或仓库。

## 页面结构

`packages/finance/ui/budget/BudgetTab.tsx` 渲染两个视图切换：

| 视图 | 组件 | 说明 |
|------|------|------|
| 部门费用预算 | `BudgetSections.createDeptBudgetSections` | 按部门+科目展示12个月预算 |
| 研发费用预算 | `BudgetSections.createRdBudgetSections` | 按项目+科目展示12个月预算 |

顶部有 `BudgetVersionSelector` 版本选择器，可切换不同预算版本。

两个视图只声明各自的筛选字段和业务身份列。筛选重置、筛选摘要、金额格式、12 个月列、月合计和表格合计行统一由 `packages/finance/ui/budget/components/BudgetSections.ts` 生成；筛选匹配及汇总计算统一由 `useBudgetFilters` 完成，不在部门/R&D 视图分别维护。

## 数据模型

### FinanceBudgetVersion（版本头表）

预算版本元数据。每年可存在多个版本，状态为 draft/active/archived。

| 字段 | 类型 | 说明 |
|------|------|------|
| year | Int | 预算年度 |
| companyId | Int? | Company FK，null 表示集团级 |
| companyCode | String? | 导入公司编码快照，不作为运行时身份 |
| name | String | 版本名称，如 "2026年初预算" |
| status | String | draft \| active \| archived |
| type | String | dept \| rd \| all，本版本包含的预算类型 |
| sourceFile | String? | 来源文件名 |
| createdBy | Int? | 创建人 userId |

约束：新版本同 (year, companyId) 下只有一个 active 版本，DB 层通过 partial unique index 强制执行。旧 `companyCode` active index 暂保留以保护尚未走 data release 回填的历史版本。

### FinanceBudgetDept（部门费用预算事实表）

| 字段 | 类型 | 说明 |
|------|------|------|
| versionId | Int | 所属版本 FK（required） |
| year | Int | 预算年度 |
| departmentId | Int? | Department FK；新导入必须有值，nullable 仅承接历史迁移 |
| dept | String | 导入部门原文快照，不作为运行时身份 |
| accountName | String | 导入科目原文快照 |
| expenseType | String | 费用类型 |
| accountId | Int? | FinanceAccount FK；新导入必须有值，nullable 仅承接历史迁移 |
| month1-month12 | Float | 各月预算金额 |
| sourceFile | String? | 来源文件 |

`@@unique([versionId, dept, accountName])` — 同一版本内部门+科目唯一。

### FinanceBudgetRd（研发费用预算事实表）

| 字段 | 类型 | 说明 |
|------|------|------|
| versionId | Int | 所属版本 FK（required） |
| year | Int | 预算年度 |
| projectId | Int? | Project FK；新导入必须有值，nullable 仅承接历史迁移 |
| project | String | 导入项目原文快照，不作为运行时身份 |
| category | String | 导入科目/费用类别原文快照 |
| accountId | Int? | FinanceAccount FK；新导入必须有值，nullable 仅承接历史迁移 |
| month1-month12 | Float | 各月预算金额 |
| sourceFile | String? | 来源文件 |

`@@unique([versionId, project, category])` — 同一版本内项目+类别唯一。

## 数据流

1. 预算 Excel、引用映射和私有 manifest 只放在 `WORKSPACE_CONFIG_DIR/data-release-*`，仓库与运行时部署包不保存租户预算源文件。
2. 一次性导入使用注册 handler `finance-budget-v1`：先解析 `Company`、`Department`、`Project`、`FinanceAccount`，任一零命中或多命中都整批失败；成功后在同一事务创建 draft 版本和预算行。
3. `FinanceBudgetVersion.companyId` 是公司身份 FK，companyCode 仅为导入快照；预算子行通过 versionId 继承公司，不重复保存 companyCode。部门、项目、科目原文分别与 departmentId、projectId、accountId 并存。旧版本在 data release 回填完成前允许按 companyCode 兼容读取，但所有新写入都必须有 companyId。
4. 用户在 BudgetTab 中选择版本查看。
5. 激活版本：POST `/api/modules/finance/budget/versions/{id}/activate`
   - 自动将同 (year, companyCode) 下其他 active 版本归档
   - 被激活的版本状态变为 active
6. 查询预算数据时：
   - 优先按指定 versionId 查询
   - 未指定时查找 active version
   - 没有任何版本时返回空预算，不读取仓库 Excel 冒充当前业务事实
7. 页面初始年度读取租户财务默认分析年度；API 必须显式携带年度，不在 route 或 schema 中写死年份。

## API 规范

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/modules/finance/budget` | GET | 查询预算数据，支持 `?versionId=` | `finance.budget.read` |
| `/api/modules/finance/budget/versions` | GET | 版本列表，支持 `?year=` | `finance.budget.read` |
| `/api/modules/finance/budget/versions` | POST | 手动创建空版本 | `finance.budget.create` |
| `/api/modules/finance/budget/versions/{id}/activate` | POST | 激活版本，自动归档旧版本 | `finance.budget.approve` |

## 计算规则

- **月合计**：service 层从 `month1`..`month12` 计算，不存储派生字段
- **筛选统计**：前端 `useBudgetFilters` hook 对两个视图复用同一筛选和汇总算法，从已加载数据中实时计算
- **预算 vs 实际**：由 `/finance/analysis` 页面通过 `budget-analysis.ts` service 读取 active version 聚合数据

## 权限

| 页面 | 需要的权限字段 |
|------|----------------|
| `/finance/budget` | `requireResourceAccess("finance.budget")` |
| 激活/创建版本 | API: `finance.budget.approve` / `finance.budget.create` |

预算导入不是网页业务动作，不注册网页导入 BusinessAction。执行方法、私有目录和回执遵循 `docs/engineering/ops/data-releases.md`；引用映射遵循 `docs/engineering/import-reference-governance.md`。

私有 schemaVersion 2 manifest 的 `execution` 形状如下；文件路径均相对该批次的 private source root：

```json
{
  "handler": "finance-budget-v1",
  "parameters": {
    "companyCode": "<existing-company-code>",
    "year": 2026,
    "versionName": "<budget-version-name>",
    "departmentFile": "finance/department-budget.xlsx",
    "researchFile": "finance/research-budget.xlsx",
    "referenceFile": "finance/budget-references.json"
  }
}
```

`referenceFile` 必须包含 `departments`、`projects`、`accounts` 三个对象，key 为 Excel 原文，value 为数据库稳定编码。未配置某个原文时 handler 只接受数据库中唯一的同名 active 记录；零命中或多命中都失败。manifest 的 checks 应断言 draft 版本数、两类预算行数以及 departmentId/projectId/accountId 的空值数为 0。
