# @workspace/core

Workspace 底座包。这里放通用契约和不依赖业务事实、权限、Prisma 的纯通用能力。

已迁入：

- `ui/PageSurface`
- `ui/FormSurface`
- `ui/DataSurface`
- `ui/DocumentSurface`
- `ui/VisualizationSurface`
- `ui/BodySurface`
- `ui/NavigationSurface`
- `ui/ConfirmModal`
- `ui/FeedbackProvider`
- `ui/useFeedback`
- `ui/DetailModal`
- `ui/Toolbar`
- `ui/Toast`
- `ui/CalendarDateInput`
- `ui/SearchableOptionInput`
- `ui/FieldValueFilter`
- `ui/StatusBadge`
- `ui/NumberCell`
- `ui/AmountCell`
- `ui/PageContent`
- `ui/TabBar`
- `ui/SplitWorkspace`
- `hooks/useCSV`
- `hooks/useToast`（兼容入口）
- `routing/workspacePath`
- `search/getInitials`、`search/getPinyinText`、`search/matchText`

页面反馈统一使用 `@workspace/core/ui` 的 `useFeedback`：成功/失败提示、确认弹窗、删除确认和未保存离开提示都从这一个 Hook 进入。

Core UI registry 记录 `declares`、`contract`、`capabilities` 和 `composes`：声明字段用于 `/settings/governance` 的 UI 能力视图，组合关系描述真实的 Core 内部依赖。旧 `category/subcategory/role` 模型已经删除；业务只使用公开 Surface、helper 和 service，`internal` 不对业务开放。

文件层级也按这个边界组织：

- `packages/core/ui/`：稳定的 Surface/runtime 门面和声明类型。
- `packages/core/ui/helpers/`：声明构造 helper。
- `packages/core/ui/services/`：非视觉服务入口。
- `packages/core/ui/host/`：预留宿主入口，当前为空。
- `packages/core/ui/internal/`：内部 renderer/primitive 实现。

根目录保留稳定的公开 Surface/runtime 入口；新的私有实现放入 `internal/<object>/`，不再新增同名兼容 shim。

`InputSurface` 的公开 spec 使用语义字段：`valueType` 描述数据形状，`control` 描述输入能力，`options` / `format` / `mask` / `state` / `validation` 描述选项、展示、输入约束和状态。业务不得声明 `spec.editor` 或直接选择内部 renderer；例如分段编码使用 `control: "text"` + `mask.kind: "editableSegment"`，远程 FK 使用 `control: "reference"` + `options.source: "remote"`。

Surface block helper 是非组件 contract helper，用于把业务表单/数据/文档/可视化/区块/弹窗/动作表达成 `PageSurface` spec，不增加 runtime import 入口。常用迁移目标：

- `createPageTableSection` / `createPageDataSection`：替代业务直接 render `DataSurface`。
- `createFieldsSection` / `createInlineFieldsSection` / `createFormSection`：替代业务直接 render `FormSurface`。
- `createDocumentSection`：替代业务用普通容器承载纸面/A4/QC 文档。
- `createVisualizationSection`：替代业务把图表、自动布局关系图、甘特、时间轴塞进旧 `DataSurface kind="visual"` 或 `FormSurface.note`；关系图由业务声明节点/边，Core 负责分层布局、连线与缩放画布。
- `createPanelSection` / `createSectionSection` / `createMessageSection` / `createEmptySection` / `createActionsSection`：替代业务用旧 page block 或 `moduleView` 承载 section、panel、message、empty、actions。
- `createPageBody`：生成 `BodySurface kind="section"`；新增页面不要再使用顶层 `blocks`、`empty`、`actions`。
- `createMasterDetailBody`：生成主列表 + 详情工作区；实体选择主栏声明 `master.presentation="compact"`，Core 在桌面压缩卡片并只保留一个辅助事实，未声明比例时使用固定主栏，移动端仍使用完整卡片；折叠状态、toolbar 按钮和移动端推进由 PageSurface 统一管理。
- `createPageTabBar`：生成 `PageSurface.tabbar kind="tabs"`；新增页面不要再使用顶层 `tabs` / `activeTab` 兼容 props。
- `createPageModalSection`：替代业务直接 render Form modal 或专用 modal wrapper。
- `createActionsSection` / `createPageCommand`：替代用 `FormSurface kind="inline"` 只渲染动作按钮。`createPageActionsSection` 仅作为兼容 alias 保留。

旧 `createPageFieldsBlock`、`createPageInlineFieldsBlock`、`createPageFormBlock`、`createPageFormModalBlock` 已删除；使用上面的无 `Page` 前缀 helper。

后续通用能力继续通过 Surface 声明和内部 renderer 收口。Core 禁止 import `@/`、Platform 或任何业务包。
