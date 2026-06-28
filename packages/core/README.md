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

Core UI 组件库主展示按 registry `category/subcategory` 分类；agent/业务调用方式只看 `exposure`。正式 direct 入口只有 `PageSurface`、`InputControl`、`SelectorPanel`、`CreatePanel`、`useFeedback`。`FormSurface`、`DataSurface`、`DocumentSurface`、`NavigationSurface`、`Toolbar`、`TabBar`、`Pagination` 等通过 direct 入口的 spec 使用，不再作为业务 runtime 入口。封装关系用 `declares` 和 `composes` 表达，不再维护额外引用层级。

`InputControl` 的公开 spec 使用语义字段：`valueType` 描述数据形状，`control` 描述输入能力，`options` / `format` / `mask` / `state` / `validation` 描述选项、展示、输入约束和状态。业务不得声明 `spec.editor` 或直接选择内部 renderer；例如分段编码使用 `control: "text"` + `mask.kind: "editableSegment"`，远程 FK 使用 `control: "reference"` + `options.source: "remote"`。

`createPage*` helper 是非组件 contract helper，用于把业务表单/数据/弹窗/动作表达成 `PageSurface` spec，不增加 direct runtime 入口。常用迁移目标：

- `createPageTableBlock` / `createPageDataBlock`：替代业务直接 render `DataSurface`。
- `createPageFieldsBlock` / `createPageInlineFieldsBlock` / `createPageFormBlock`：替代业务直接 render `FormSurface`。
- `createPageModalBlock` / `createPageFormModalBlock`：替代业务直接 render Form modal 或专用 modal wrapper。
- `createPageActionsBlock` / `createPageCommand`：替代用 `FormSurface kind="inline"` 只渲染动作按钮。
- `createPageSurfaceProps`：给 route/module thin adapter 从 AppShell 迁到 `PageSurface` 五段协议。

后续可迁入 FK 搜索、tag 输入、表格和更多筛选/字段组件。Core 禁止 import `@/`、Platform 或任何业务包。
