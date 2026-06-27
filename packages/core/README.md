# @workspace/core

Workspace 底座包。这里放通用契约和不依赖业务事实、权限、Prisma 的纯通用能力。

已迁入：

- `ui/PageSurface`
- `ui/FormSurface`
- `ui/DataSurface`
- `ui/NavigationSurface`（Core 内部 / 正文导航 primitive）
- `ui/ConfirmModal`
- `ui/FeedbackProvider`
- `ui/useFeedback`
- `ui/DetailModal`
- `ui/Toolbar`
- `ui/Toast`
- `ui/CalendarDateInput`
- `ui/SelectField`
- `ui/FieldValueFilter`
- `ui/StatusBadge`
- `ui/NumberCell`
- `ui/AmountCell`
- `ui/OptionPicker`
- `ui/PickerShell`
- `ui/PageContent`
- `ui/TabBar`
- `ui/DataTable`
- `ui/SplitWorkspace`
- `hooks/useCSV`
- `hooks/useToast`（兼容入口）
- `routing/workspacePath`
- `search/getInitials`、`search/getPinyinText`、`search/matchText`

页面反馈统一使用 `@workspace/core/ui` 的 `useFeedback`：成功/失败提示、确认弹窗、删除确认和未保存离开提示都从这一个 Hook 进入。

Core UI 组件库主展示按 registry `uiLevel` 分层：页面 L1 是 `PageSurface`，正文 Surface 是 `FormSurface` / `DataSurface`，反馈入口是 `useFeedback`；`NavigationSurface`、`Toolbar`、`TabBar`、`Pagination` 只作为 PageSurface/Core 内部 renderer 或正文 primitive，不再作为业务页面布局入口。L2/L3 用于 kind/spec 和内部可见组合层，L4+ 只作为 Core 内部实现依赖，不进入主展示。

后续可迁入 FK 搜索、tag 输入、表格和更多筛选/字段组件。Core 禁止 import `@/`、Platform 或任何业务包。
