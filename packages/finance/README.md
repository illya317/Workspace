# @workspace/finance

财务业务包边界。当前承载模块注册、财务通用页面模板、筛选模板、重分类 UI，以及第一批财务 server/types/import 实现。后续财务模块继续按目录逐步迁入。

```txt
ui/        # 财务页面组件和 hooks
server/    # 财务查询、报表、预算、成本和 DTO 组装
types/     # 财务 DTO 和领域类型
constants/ # 财务选项、字段常量和非业务事实常量
import/    # 财务导入解析、清洗和校验流程
```

已迁入：

- `ui/components/ReclassConfigView.tsx`：财务重分类配置视图。
- `ui/components/AccountCodeInput.tsx`、`Pagination.tsx`、`ReclassConfigRow.tsx`、`ui/ledger/reclassColumns.tsx`：重分类配置视图的局部依赖。
- `ui/components/FinanceShell.tsx`：财务模块页面壳和二级导航。
- `ui/components/FinanceFilters.tsx`：财务全域筛选模板，基于 Core `Toolbar` / `InputSurface`。
- `ui/components/CompanyPeriodPicker.tsx`：公司、年度、月份组合选择模板。
- `ui/components/ReclassReviewView.tsx`、`ui/components/ReclassReviewModal.tsx`：重分类审核视图和调整弹窗，基于 Core 表格与 `InputSurface` 字段规格。
- `ui/budget/*`：预算管理页面、预算版本选择、部门/研发预算筛选和预算表格；旧 `app/finance/budget/{components,hooks}` 已迁入包内。
- `ui/cost/*`：成本管理页面、筛选、汇总、追溯弹窗和成本明细表格；旧 `app/finance/cost/{components,hooks}` 已迁入包内，并统一基于 Core 表格/分页/按钮 primitive。
- `ui/import/*`：财务导入上传、预览和结果展示；旧 `app/finance/import/{ImportClient,components}` 已迁入包内。
- `ui/navigation/nav-utils.ts`：财务子模块导航和权限过滤 helper。
- `types/reclass.ts`：重分类配置 UI 使用的候选 DTO 类型。
- `server/import/`、`server/budget/`、`server/analysis/`：财务导入预览/确认、预算版本/预算数据和预算分析服务；旧 `server/services/finance/{import,budget,analysis}` 已收口到财务业务包。
- `server/ledger/`、`server/schedules/`：财务科目、凭证、余额滚动、重分类、重分类规则和调度计算服务；旧 `server/services/finance/{ledger,schedules}` 已收口到财务业务包。
- `server/cost/`：成本汇总、发货、工资、成本构成、成本分析、车间报表和导入记录服务；旧 `server/services/finance-cost` 已收口到财务业务包。
- `server/statements/`：财务报表配置、映射、底稿、校对、报表生成和差异计算服务；旧 `server/services/finance/statements` 已收口到财务业务包。

旧 `app/finance/components/*`、`app/finance/budget/{components,hooks}`、`app/finance/cost/{components,hooks}` 和 `app/finance/import/components` 兼容出口已删除。财务页面模板、筛选、分页、表格、预算、成本、导入和重分类共享 UI 必须从 `@workspace/finance/ui` 消费；新增真实实现不得回到 `app/finance/components` 或 route 子目录。
