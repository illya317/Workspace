# @workspace/core

Workspace 底座包。这里放通用契约和不依赖业务事实、权限、Prisma 的纯通用能力。

已迁入：

- `ui/PageSurface`
- `ui/FormSurface`
- `ui/DataSurface`
- `ui/DocumentSurface`
- `ui/VisualizationSurface`
- `ui/BodySurface`
- `ui/NavigationRenderer`（Core 内部 / 正文导航 primitive）
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

Core UI 组件库主展示按 registry `category/subcategory` 分类，目前一级分类为 `page / data / form / document / visualization / common / feedback`。分层由 `role` 表达：`surface` 是声明接口，`helper` 是声明助手，`service` 是非视觉服务，`host` 是白名单宿主入口，`internal` 是 Core 内部实现。业务侧默认只使用 `surface/helper/service`；`host` 当前为空备用；`internal` 不对业务开放。

文件层级也按这个边界组织：

- `packages/core/ui/`：Surface 声明类型。
- `packages/core/ui/helpers/`：声明构造 helper。
- `packages/core/ui/services/`：非视觉服务入口。
- `packages/core/ui/host/`：预留宿主入口，当前为空。
- `packages/core/ui/internal/`：内部 renderer/primitive 迁移目标。

根目录同名文件只作为兼容 re-export shim，新增文件应放入对应层目录。

`InputSurface` 的公开 spec 使用语义字段：`valueType` 描述数据形状，`control` 描述输入能力，`options` / `format` / `mask` / `state` / `validation` 描述选项、展示、输入约束和状态。业务不得声明 `spec.editor` 或直接选择内部 renderer；例如分段编码使用 `control: "text"` + `mask.kind: "editableSegment"`，远程 FK 使用 `control: "reference"` + `options.source: "remote"`。

Surface block helper 是非组件 contract helper，用于把业务表单/数据/文档/可视化/区块/弹窗/动作表达成 `PageSurface` spec，不增加 runtime import 入口。常用迁移目标：

- `createPageTableSection` / `createPageDataSection`：替代业务直接 render `DataSurface`。
- `createFieldsSection` / `createInlineFieldsSection` / `createFormSection`：替代业务直接 render `FormSurface`。
- `createDocumentSection`：替代业务用普通容器承载纸面/A4/QC 文档。
- `createVisualizationSection`：替代业务把图表、甘特、时间轴塞进旧 `DataSurface kind="visual"` 或 `FormSurface.note`。
- `createPanelSection` / `createSectionSection` / `createMessageSection` / `createEmptySection` / `createActionsSection`：替代业务用旧 page block 或 `moduleView` 承载 section、panel、message、empty、actions。
- `createPageBody`：生成 `BodySurface kind="section"`；新增页面不要再使用顶层 `blocks`、`empty`、`actions`。
- `createPageTabsNavigation`：生成 `PageSurface.navigation kind="tabs"`；新增页面不要再使用顶层 `tabs` / `activeTab` 兼容 props。
- `createPageModalSection`：替代业务直接 render Form modal 或专用 modal wrapper。
- `createActionsSection` / `createPageCommand`：替代用 `FormSurface kind="inline"` 只渲染动作按钮。`createPageActionsSection` 仅作为兼容 alias 保留。
- `createPageSurfaceProps`：给 route/module thin adapter 从 AppShell 迁到 `PageSurface` 五段协议。

旧 `createPageFieldsBlock`、`createPageInlineFieldsBlock`、`createPageFormBlock`、`createPageFormModalBlock` 已删除；使用上面的无 `Page` 前缀 helper。

后续可迁入 FK 搜索、tag 输入、表格和更多筛选/字段组件。Core 禁止 import `@/`、Platform 或任何业务包。
