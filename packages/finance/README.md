# @workspace/finance

财务业务包边界。当前承载模块注册、财务通用页面模板、筛选模板和第一批重分类 UI。后续财务模块的 server、types、constants、import 继续按目录逐步迁入。

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
- `ui/components/FinanceFilters.tsx`：财务全域筛选模板，基于 Core `FilterToolbar` / `SelectField`。
- `ui/components/CompanyPeriodPicker.tsx`：公司、年度、月份组合选择模板。
- `ui/navigation/nav-utils.ts`：财务子模块导航和权限过滤 helper；旧 `app/finance/lib/nav-utils.ts` 只保留兼容 re-export。
- `types/reclass.ts`：重分类配置 UI 使用的候选 DTO 类型。

旧 `app/finance/components/{FinanceShell,FinanceFilters,CompanyPeriodPicker,Pagination,ReclassConfigView,ReclassConfigRow,AccountCodeInput}.tsx` 只作为 Next app 兼容出口。新增财务页面模板或共享筛选控件必须进入 `@workspace/finance/ui`。
