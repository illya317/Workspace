# @workspace/core

Workspace 底座包。这里放通用契约和不依赖业务事实、权限、Prisma 的纯通用能力。

已迁入：

- `ui/ConfirmModal`
- `ui/ConfirmProvider`
- `ui/DetailModal`
- `ui/FilterBar`
- `ui/FilterToolbar`
- `ui/Toast`
- `ui/CalendarDateInput`
- `ui/SelectField`
- `ui/StatusBadge`
- `ui/StatusToggle`
- `ui/NumberCell`
- `ui/AmountCell`
- `ui/ColumnToggle`
- `ui/OptionPicker`
- `ui/PickerShell`
- `ui/PageContent`
- `ui/TabBar`
- `ui/DataTable`
- `ui/FilterField`
- `ui/EditToolbar`
- `ui/SplitWorkspace`
- `ui/SplitWorkspaceToolbar`
- `hooks/useCSV`
- `hooks/useToast`
- `routing/workspacePath`
- `search/getInitials`、`search/getPinyinText`、`search/matchText`

后续可迁入 FK 搜索、tag 输入、表格和更多筛选/字段组件。Core 禁止 import `@/`、Platform 或任何业务包。
