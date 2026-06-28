# Core UI Registry 治理

Core UI 是整个产品的公共视觉和交互接口。业务页、Platform 页和 agent 不能按局部需求随手复制基础控件；所有通用 UI 都必须通过 Core UI registry 收口。

## 1. Registry 模型

| 字段 | 用途 | 业务/agent 可直接使用 |
|---|---|---|
| `category/subcategory` | 一级/二级分类，只用于归属、筛选和展示 | 不决定 |
| `exposure` | 调用方式：`direct` / `via` / `internal` | 只能 runtime import `direct` |
| `declares` | 公开声明项，例如 `control`、`valueType`、`options` | 通过 direct 入口的 spec 使用 |
| `composes` | 入口封装的 Core 能力 | 不直接 import |

旧分层字段已删除，不再作为分类、筛选、展示或 gate 依据。

## 2. Agent 使用规则

普通 Feature/Data/Operations agent：

- Toolbar 规则另见 `docs/engineering/core-toolbar.md`；该文档是所有页面级工具栏的专门规范。
- 只从 `@workspace/core/ui` runtime 使用 `exposure: direct` 的正式入口：`PageSurface`、`InputControl`、`SelectorPanel`、`CreatePanel`、`useFeedback`。
- `FormSurface`、`DataSurface`、`DocumentSurface` 只能通过 `PageSurface.body.blocks[]` 使用；页面级导航、toolbar、分页必须通过 `PageSurface.navigation`、`PageSurface.toolbar`、`PageSurface.footer` 表达。
- `@workspace/core/ui` 的 type-only import 只允许 Surface contract 类型和业务别名：`DataSurface*`、`FormSurface*`、`NavigationSurface*`、`PageSurface*`、`ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。业务不得再 type-only 直引底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；分别使用 `DataSurfaceColumnSpec` / Surface contract、`SurfaceToolbarItem(s)`、`ReferenceOption`。
- 不直接 import `exposure: via` 或 `internal` 的组件作为业务 runtime 组件；过渡期只允许上述 Surface contract / business alias type-only 引用。
- 不直接 import `Core Internal`、`Foundation`、`Private Impl`。
- 不新增业务包 `Toolbar`、`Picker`、`Select`、`Search`、`Table`、`Modal`、`DateInput`、`Pagination`、`Tab` 等重复基础 UI。
- 业务页不得在 Surface spec 中塞 `custom` 渲染自定义控件；例如 toolbar/action spec 禁止 `kind: "custom"`。`custom` 和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则。
- `PageSurface` 的 `moduleView` 是历史过渡逃生口，不是新增页面 API。存量已按 `shell-host`、`content-wrapper`、`split-side`、`analysis-visual`、`report-document`、`complex-editor`、`navigation-composition` 分类迁出，`businessModuleViewUsages` baseline 当前为 0；逐项 disposition 以 `docs/engineering/core-ui-module-view-migration.md` 为准。新增前必须先补 Surface contract 或写清 Core 缺口。
- 纸面/A4/报告类内容使用 `PageSurface` 的 `document` block，由 Core `DocumentSurface` 管理文档宿主、宽度、字体和多页容器；业务不得再用 `moduleView` 承载报告页。
- 发现现有 Page API 不够用时，先停下来写清缺口；由 Architecture/Core UI 任务补公开接口，再回业务页替换。
- Platform runtime 使用 Core UI 时同样只能走正式 direct 入口、根级 `FeedbackProvider` 和纯非组件事件能力；系统专有菜单、系统壳和账号入口由 Platform 自己封装，不再保留 `PageShell` / `DropdownMenu` 直引例外。Agent 页面 UI 已停用，仅保留 API / bot 接入能力。

Architecture/Core UI agent：

- 可以修改 `packages/core/ui/**`、Core UI registry、showcase preview 和治理脚本。
- 必须使用 `CORE_UI_CHANGE=1` 明确授权本次是 UI-system 任务。
- 必须同步更新 registry、preview、导出和关系声明。
- 必须保持 `npm run arch:gate`、`npm run lint:changed`、`npm run typecheck:quick` 无豁免通过。

Review agent：

- 优先检查业务页是否绕过 Page API。
- 优先检查 Core UI 新增/删除是否同步 registry、preview、关系图和文档。
- 重点审查是否有人为了过 gate 随手新增 Core UI registry、页面/API/resource registry 或 baseline；注册项必须对应真实可复用入口，不能只为单页手搓组件背书。
- 重点审查重复和可拆除项：只在 showcase 使用、没有业务消费、或与现有 Toolbar/Picker/Table/Modal/Page Frame 重叠的组件，应要求删除、合并或下沉到既有入口。
- 重点审查业务是否直接 import `SelectorList`、`SelectorTree`、`SelectorCard`，或手写 `PanelCard + Selector*` 作为左侧选择区；业务应改用 `PageSurface.body` 的 navigation typed block 或正文 Surface spec。
- 发现 `Core Internal` / `Foundation` 业务直引时，结论必须是不通过，除非该文件是明确的 Core UI-system 任务。

## 3. Layout 引用契约

Core UI 的 layout 规则分为“内容规则”和“外观规则”。业务页不得用自由 `className` 覆盖基础尺寸来绕过契约。

### 3.1 内容规则

字体、字号、字重、行高、垂直居中、文字颜色层级等内容要素，必须跟随引用主体，没有例外。

- Toolbar 里的字段、日期、按钮、下拉选项，文字表现跟随 Toolbar。
- 表格里的输入、选择、只读值，文字表现跟随表格。
- 详情页里的输入、选择、只读值，文字表现跟随详情页字段区。
- 纸面/填表类控件，文字表现跟随纸面/填表主体。

不要把基础字段组件设计成到处自己决定 `sm/md/lg`。组件可以接收引用主体传来的 context，但字体字号本身由引用主体语义决定。

### 3.2 外观规则

基础 UI 只允许落入三种 layout policy。

| Policy | 含义 | 典型场景 | 冲突时谁说了算 |
|---|---|---|---|
| `intrinsic` | 框架随内容变化，可以参差不齐 | Toolbar、顶部筛选条、inline actions | 引用主体决定这是 intrinsic，子 UI 自行适配内部细节 |
| `parentLocked` | 父级框架锁定行高、列宽、对齐，子 UI 必须服从 | 表格单元格、批量录入、纸面表单、FieldGrid、Panel 内固定字段网格 | 父级框架说了算 |
| `selfLocked` | 系统级反馈层自行锁定框架，不随业务页面变化 | Toast、ConfirmModal、ErrorDialog、LoadingOverlay、阻塞式系统提示窗口 | 组件自身说了算，仅限系统反馈层 |

普通 Button、Badge、Tag、Metric、Field、Select、DateInput 都不默认属于 `selfLocked`。它们可以有 Core 默认外观，但在业务布局里必须服从引用主体。

页面级全局组件是例外中的另一类稳定规格组件：Toolbar、TabBar、WorkspaceSplitPage 左侧栏、PanelCard 页面壳等本身定义页面结构，不应被正文、表格或字段 context 反向改变尺寸。引用方只能选择 Core 暴露的语义档位，例如大/中/小、compact/normal、bar/inline，不得手写尺寸覆盖。

### 3.3 父子职责

父级/引用主体负责声明“你在我这里是什么”：

- Toolbar 声明子控件处于 `intrinsic`。
- 表格、批量录入、纸面表单声明子控件处于 `parentLocked`。
- 详情页字段区声明子控件跟随详情页字段 context，并在同一区域内保持一致。
- 系统反馈组件才允许 `selfLocked`。
- 页面级全局组件使用自身稳定规格；正文 context 不影响它们，引用方只选语义档位。

子 UI 负责实现“在该 context 下怎么长”：

- `SelectField` 自己适配 trigger、option、dropdown 的字号、padding、行高。
- `CalendarDateInput` 自己适配日期宽度。
- `FieldValueFilter` 自己适配二段筛选内部布局。
- `TextField` / `ReadOnlyField` / `FkFieldInput` 自己适配字段壳内部结构。

冲突规则：

1. 父级 layout policy 优先于子 UI 默认外观。
2. 父级只能通过 Core 定义的语义 context/policy 表达约束，不得用自由 `className` 硬改高度、padding、字号、圆角、阴影。
3. 子 UI 不得用自己的默认尺寸压过父级框架。
4. 只有 `selfLocked` 系统反馈组件可以拒绝业务父级尺寸约束。
5. 页面级全局组件按自身稳定规格执行，不能因为被某个页面、表格或面板引用就改变基础尺寸。

### 3.4 治理口径

尺寸治理不是“删掉所有 className 让它自适应”，而是把规则从业务 className 上移到 Core UI 的引用主体 context。

- Toolbar 需要紧凑、自适应、可参差。
- 表格/填表需要稳定、等高、必要时等宽。
- 详情页需要响应式，但同一字段区内部要一致。
- 除系统反馈层外，普通 UI 都应该服从引用主体，而不是拿 Core 默认尺寸压过父级布局。

## 4. Page Frame

Page Frame 是页面骨架，不是业务组件。它只定义页面区域和 slot，例如顶部区、工具栏区、左右分栏、主内容区、空态/加载/错误位。

Frame 禁止包含：

- 员工、岗位、会议、凭证等业务事实。
- 数据请求。
- 权限判断。
- 业务状态流转。

Page Frame 只作为 `page.frame` 分类下的实现能力，不再维护单独成熟度字段；是否能被业务/agent 直接使用仍由 `exposure` 决定。

## 5. Page API / Surface

业务 runtime 的直接入口已经收敛为 `exposure: direct`：

- `PageSurface`
- `InputControl`
- `SelectorPanel`
- `CreatePanel`
- `useFeedback`

Core UI 的分类是五个一级分类，不等于五个 runtime Surface：

| 一级分类 | 二级分类 | 说明 |
|---|---|---|
| `page` | `page.surface` / `page.blocks` / `page.frame` / `page.document` | 页面骨架、正文 block 和纸面 renderer。`DocumentSurface` 归 `page.document`，只能作为 `PageSurface.body` renderer。 |
| `data` | `data.surface` / `data.table` / `data.record` / `data.metric` / `data.visual` / `data.cell` | 数据正文、表格、记录、指标、图表和数据单元格。 |
| `form` | `form.surface` / `form.field` / `form.layout` / `form.create` / `form.input-adapter` | 表单正文、字段布局、创建流和 Form spec 到 Common input/selection 的适配。 |
| `common` | `common.chrome` / `common.action` / `common.input` / `common.selection` / `common.display` / `common.overlay` / `common.foundation` | 跨 Surface 复用能力。`Toolbar`、`TabBar`、`Pagination`、`NavigationSurface` 归 `common.chrome`；输入和选择器拆到 `common.input` / `common.selection`；`Badge`、空态、代码块等归 `common.display`。不新增 `CommonSurface`。 |
| `feedback` | `feedback.service` / `feedback.renderer` | `useFeedback` 和反馈 renderer。旧确认兼容入口不再作为 Core UI API 暴露。 |

页面布局协议固定为五段：

1. `header`：页眉，默认页面必须有；登录页等特殊页面可显式 `hidden`。
2. `navigation`：页面级声明式导航段。L1/L2 模块入口属于 route/module 层或模块入口卡片，不放进 `TabBar`；`TabBar` 只承载当前页面内部视图切换，也就是 L3 及以下。
3. `toolbar`：页面级唯一工具栏。搜索、筛选、字段切换、刷新、导出、新建、生成等都必须表达为标准 toolbar item。
4. `body`：正文，只能承载 `FormSurface` / `DataSurface` / `DocumentSurface` / typed blocks，可选 single/split。
5. `footer`：页脚；表格/数据分页只能在 `PageSurface.footer.pagination`。

`NavigationSurface`、`FormSurface`、`DataSurface` 不决定页面位置。`NavigationSurface` 归 `common.chrome`，只能是 PageSurface 内部 renderer 或正文 primitive；`FormSurface` / `DataSurface` 只能通过 `PageSurface.body.blocks[]` 选择正文内容形态，不承载页面级 toolbar/pagination。

正式 direct runtime entry 固定为五个：`PageSurface`、`InputControl`、`SelectorPanel`、`CreatePanel`、`useFeedback`。除此之外，Core 可以导出非组件 contract helper，但 helper 不计入 direct component entry，也不允许恢复 `FormSurface` / `DataSurface` / `ActionButton` / `Toolbar` / `TabBar` 直引。

`InputControl` 是字段语义入口，不是 renderer 选择器。业务只声明 `valueType`、`control`、`options`、`format`、`mask`、`state`、`validation`、`usage` 和 `dependencies`；Core 内部 resolver 决定实际使用 `TextField`、`SelectField`、`CalendarDateInput`、`FkFieldInput`、`SegmentedCodeInput` 等实现。新增字段不得写 `spec.editor`，分段编码统一写成 `control: "text"` + `mask.kind: "editableSegment"`，FK 搜索统一写成 `control: "reference"` + `options.source: "remote"`。

当前批准的 PageSurface spec helper：

- `createPageTableBlock(key, table)`：生成 `PageSurface` 的 `data.table` block。迁移业务 `<DataSurface kind="table" ... />` 时优先使用。
- `createPageDataBlock(key, surface)`：生成任意 `DataSurfaceProps` block。用于 `structured`、`records`、`metrics`、`visual`、`raw`。
- `createPageFieldsBlock(key, fields, options)`：生成 `FormSurface kind="fields/detail"` block。迁移普通表单正文。
- `createPageInlineFieldsBlock(key, fields, options)`：生成 `FormSurface kind="inline/filters"` block。迁移筛选行、轻量 inline field 组。
- `createPageFormBlock(key, surface)`：低层 form block wrapper。仅在上面两个 helper 不够表达时使用。
- `createPageModalBlock(key, modal)`：生成 `PageSurface` modal block，modal 内容继续用 typed blocks。
- `createPageFormModalBlock(key, modal, surface)`：生成包含 form block 的 modal。迁移 `FormSurface kind="modal"`。
- `createPageActionsBlock(key, actions)` 与 `createPageCommand(command)`：生成动作 block。迁移用 `FormSurface kind="inline"` 只承载按钮的历史写法。
- `createPageSurfaceProps(options)`：给 route/module thin adapter 生成非 split `PageSurface` props。AppShell 迁移使用它表达 header/body/toolbar/footer，不和 form/data 清债混在一起。

这些 helper 只能返回 spec，不渲染组件、不读取业务事实、不依赖 Platform。业务可以 import helper 生成 spec，但最终渲染仍必须经过 `PageSurface`。

L2/L3 组件可以在 UI component library 中用于关系图、阅读和迁移，但业务包与 `app/(modules)` 不得 runtime import 它们。历史的 Page API 名称只能作为 Surface 的内部实现、showcase 可见层、兼容迁移说明或 type-only 引用。

所有 Page API registry entry 必须满足：

- 在 registry 中登记。
- 有中文 `description` 和中文 `example`。
- 有 `/settings/ui` 预览；复杂组件需要覆盖关键参数。
- props 契约稳定。
- 不暴露内部样式 recipe 或内部部件给业务页。

典型 L2/L3 可见能力层：

- 页面/布局：`PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`WorkspaceSplitPage`
- Chrome/动作：`Toolbar`、`TabBar`、`Pagination`、`CommandButton`
- 数据：`DataTable`、`StructuredTable`、`TableScrollFrame`；分析图表通过 `DataSurface kind="visual"` 的纯数据 spec 表达
- 表单：`FormField`、`TextField`、`SelectField`、`CalendarDateInput`、`TimeField`、`FieldGrid`
- 选择：`OptionPicker`、`SelectorPanel`；业务/agent 只直接使用 `SelectorPanel`
- 输入/展示：`TagListInput`、`Badge`、`CodeBlock`、`EmptyStateCard`
- 反馈：`ConfirmModal`、`Toast`

Surface 使用红线：

- 业务 runtime 不直接 import `Toolbar`、`PanelCard`、`FormSurface`、`DataSurface`、`DataTable`、`SelectField`、`ConfirmModal` 等 `via/internal` entry；通过 `PageSurface` 五段协议、`InputControl`、`SelectorPanel`、`CreatePanel` 或 `useFeedback` 表达。
- 业务 type-only 不直接 import 底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；使用 Surface contract 或业务别名 `ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。
- Surface 内部的 `Toolbar` 只能接收语义化 item：`create`、`search`、`field-filter`、`option-group`、`column-toggle`、`page-size`、`text`、`icon-button`、`action-group`、`edit-group` 等。
- 业务传给 Surface 的 toolbar/action spec 禁止使用 `kind: "custom"` 拼装搜索、筛选、统计、分页、动作或任意自定义节点。
- 如果现有语义 spec 不够表达业务需要，必须扩展正式 direct 入口或对应 Core 能力，并写入 special-to-be-reviewed 说明等待 Core UI 评审；不得用 `custom` 临时绕过。
- Core 内部 preview/showcase 或明确 UI-system 任务也不得恢复 `ToolbarCustomItem`；临时验证应扩展标准 item 或使用非 Toolbar 的普通预览容器。
- Surface 内部 toolbar 的 `option-group` 默认是 micro accordion；普通 agent 不要把长分段筛选常驻铺开。
- 业务侧左侧列表、目录树和选择区通过正式入口 `SelectorPanel` 表达；页面级导航和流程步骤通过 `PageSurface.navigation` 表达。`NavigationSurface`、`SelectorList`、`SelectorTree`、`SelectorCard` 是 L2/L3 或 Core 内部组合件，不作为页面布局入口。

## 5.1 Hygiene-Cap Migration Recipe

109 个 `FormSurface` / `DataSurface` runtime 直引按以下顺序清：

1. 组件已经在父级 `PageSurface` 内：把子组件改为返回 `PageSurfaceBlockSpec` 或 block 数组，父级 `blocks/body.blocks` 接入。`DataSurface` 用 `createPageTableBlock` / `createPageDataBlock`；`FormSurface` 用 `createPageFieldsBlock` / `createPageInlineFieldsBlock` / `createPageFormBlock`。
2. 子组件目前直接返回表格或表单 JSX：先改成 thin block builder，例如 `buildXxxTableBlock()` / `buildXxxFormBlock()`；调用方负责放进 `PageSurface`。不要新增 domain `*Surface` 或 `*Shell`。
3. 历史 `FormSurface kind="modal"`：迁移到 `createPageFormModalBlock`，或在已有 `PageSurface` modal block 里放 `createPageFieldsBlock`。
4. 历史 `FormSurface kind="inline"` 只承载按钮：迁移到 `createPageActionsBlock`，按钮使用 `createPageCommand` 或直接写 `PageSurfaceCommandSpec`。
5. `InputControl`、`SelectorPanel`、`CreatePanel` 本来就是 direct entry；只有在它们被业务包裹成重复基础组件时才继续收敛。

7 个 Platform Core UI runtime 直引按以下 recipe 清：

1. `PermissionCell` 这类 inline action：使用 `PageSurface` embedded + `createPageActionsBlock`，或在上级 table cell spec 中返回 `DataSurfaceCellSpec kind="action/actions"`。
2. `AuditLogModal`、`NotificationBell` 这类 overlay：外层 overlay 可以保留 Platform 专有行为；内部筛选、分页、表单内容用 `createPageFieldsBlock`、`createPageModalBlock`、`PageSurface.footer.pagination` 表达。
3. Admin tabs 的表单/表格：和业务 109 同样迁到 `PageSurface` blocks；不要为了系统页重新开放 `FormSurface` / `DataSurface`。

28 个 `AppShell` primitive 是页面壳迁移债，单独处理：

1. route/page 层保留鉴权和模块事实，生成 `PageSurface` props；不要把 AppShell 注册为 Core/Page API。
2. 使用 `createPageSurfaceProps` 表达 `header/title/backHref/body/toolbar/footer`。用户菜单、通知铃、logo 仍由 Platform thin adapter 提供为 `header.leading/actions`，不进 Core。
3. 每个 URL 只保留一个页面级 `PageSurface`。子模块如果需要独立内容，返回 typed blocks 或嵌入式 `PageSurface`，不能通过 provider 反向注册 toolbar/navigation。

新增 Page API 时必须同步：

1. `packages/core/ui/<Name>.tsx`
2. `packages/core/ui/index.ts`
3. `packages/core/ui/component-registry-data-*.ts`
4. `packages/core/showcase/previews/*`
5. 必要时更新 `docs/engineering/core-ui-governance.md` 或 `docs/engineering/reusable-components.md`

新增 direct 入口必须由 `exposure` 硬锁为 `PageSurface`、`InputControl`、`SelectorPanel`、`CreatePanel`、`useFeedback`；`via` 必须指向这些 direct 入口。基础/私有实现只保留在 registry 关系数据中，不得作为 UI 组件库主展示根节点或业务可调用入口。

新增或迁移 registry entry 时必须填写 `category`、`subcategory`；业务/agent 可调用性只由 `exposure` 表达。`arch:structure` 会报告 `coreUiMissingOwnership`、`coreUiInvalidOwnership`、`coreUiCommonDomainDependency`、`coreUiSiblingL2Coupling`、`businessCommonRendererImports`、`domainSharedL2LayoutShells`、`surfaceOwnsPageChrome`，以及业务视觉 token 硬编码、Core 业务事实泄漏、组件内本地 UI config 候选。结构性 UI 项进入 `gate:ui`，简单清扫项进入 `check:hygiene`；不能为了消警把 domain shared shell 注册成 Core/Page API。

`FinanceShell`、`QcModuleShell`、`AdminToolbarProvider` 这类“同一个 L2 共有的布局壳”是历史债，禁止注册为 Core/Page API。长期方式是 route/module 层生成 `PageSurface` props，或 domain thin adapter 只返回/组合 `PageSurface` spec；页面级 header/navigation/toolbar/body/footer 必须由 `PageSurface` props 一次性声明，禁止子组件通过 provider 或 `useXxxPageToolbar` 反向注册页面 chrome。

## 6. Core Internal

Core Internal 是公开 API 的内部组合。它可以注册到关系图，但业务页不能直接 import。

例子：

- `ActionButton`
- `DropdownSurface`
- `PickerShell`
- `PickerOptionButton`
- `ToolbarOptionGroup`
- `TreeNodeCard`
- `TreeNodeBranch`
- `RemovableTag`
- `TagPill`
- `InlineCreatePanel`
- `BlockCreatePanel`
- `ModalCreatePanel`
- `DetailCreatePanel`

改造规则：

- 如果业务页正在直接用 Core Internal，必须补或扩 Page API，再替换业务调用点。
- 不保留 deprecated/compat 壳给业务继续用。
- 如果只是某个公开组件自己的拆分，不应注册为 Core Internal，应作为 Private Impl。

## 7. Foundation

Foundation 是视觉材料，不是业务可用接口。

例子：

- `ActionGlyph`
- `ACTION_GLYPH_KINDS`
- `ACTION_GLYPH_ORDER`
- `ACTION_GLYPH_GROUPS`
- `getToolbarActionClassName`
- `getFieldInputClassName`
- `getReadOnlyFieldClassName`
- `getFieldGridCellClassName`
- `dataTableClassNames`
- `moduleCardColorClasses`

Foundation 改造规则：

1. Foundation 必须登记为 `common.foundation`，确保关系图可追踪。
2. Page API / Core Internal 使用 Foundation 时，统一写在 `composes` 字段。
3. Foundation 之间的复用也统一写在 `composes` 字段。
4. 业务页不得直接 import Foundation。
5. 发现业务直引 Foundation 时，补 Page API 或扩已有 Page API，再替换业务调用点。

例外：`ActionGlyph` 是全局唯一的 SVG/action icon 封闭表。动作、状态、权限来源这类 UI 图标必须先注册到 `ActionGlyph`，再由页面 API、Surface spec、平台 wrapper 或少数 icon-only cell 使用；不得在业务/平台文件里手写新的 `<svg>`。`ActionGlyph` 允许作为图标基础入口直接 import，但它不是 agent direct 业务组件，不允许借它绕开 Toolbar/PageSurface 的动作协议。

## 8. Private Impl

Private Impl 是公开 UI 自己拆出来的内部文件。它不注册为独立 UI，不出现在 `/settings/ui` 组件卡片里，不允许业务 import。

例子：

- `OptionPickerContent.tsx`
- `OptionPickerParts.tsx`
- `OptionPickerTypes.ts`
- `Toolbar.parts.tsx`
- `Toolbar.types.ts`
- `DataTable.types.ts`

Private Impl 修改等同于修改所属公开 UI，必须按 Core UI-system 任务处理。

## 9. 硬约束

本地提交前：

- `.githooks/pre-commit` 会运行 `scripts/check/check-core-ui-guard.js --staged`。
- 未授权修改 core UI / registry / preview 会失败。
- 新增业务包 `*Toolbar.tsx` 会失败。
- 新增 `eslint-disable` 会失败。
- 新增或删除 core UI 但 registry/preview 未同步会失败。

收口/CI：

- `npm run arch:gate` 会运行 Core UI guard、registry relation validation、structure ratchet 和 package boundary。
- 非 direct Core UI 业务直引、新增未注册 Core UI、重复 registry、归属非法、基础/私有实现主展示泄漏、页面设计漂移、重复基础 UI 都必须由 gate 或 baseline ratchet 拦住。
- 业务 UI 和 `app/(modules)` 只能从 `@workspace/core/ui` runtime 引入正式 direct 入口：`PageSurface`、`InputControl`、`SelectorPanel`、`CreatePanel`、`useFeedback`；`FormSurface`、`DataSurface`、`DocumentSurface`、`NavigationSurface`、`Toolbar`、`TabBar`、`Pagination` 等只能通过 direct 入口 spec 使用。新增直连由 `gate:ui` 阻断，存量迁移需要对应 Feature/Architecture 负责，不交给 Hygiene 重构。
- 业务 UI 和 `app/(modules)` 新增 `PageSurface` `moduleView` block 会进入 `businessModuleViewUsages` ratchet；该 baseline 当前为 0，新增即失败，必须迁移到 typed block / Surface spec。
- Platform UI 只能从 `@workspace/core/ui` runtime 引入正式 direct 入口、根级 `FeedbackProvider` 和纯非组件事件能力；其他 Core UI runtime 直引由 `platformCoreUiRuntimeBypassImports` baseline 锁定，baseline 必须保持为空，`PageShell` / `DropdownMenu` 不再作为系统壳例外。
- baseline 只能减少，不能把新增违规写入 baseline。
- 大规模 UI 迁移前后必须阅读或运行 Core UI governance checks，确认 L1/L2/L3/L4 展示层级、registry 关系、`businessCoreUiSurfaceBypassImports`、`businessModuleViewUsages` 和 `platformCoreUiRuntimeBypassImports` baseline 都在收敛；长期迁移按阶段定期复查，而不是等最后一次性补 gate。

授权方式：

```bash
CORE_UI_CHANGE=1 git commit ...
CORE_UI_CHANGE=1 npm run arch:gate
```

或创建明确任务说明：

```text
/Users/koito/Desktop/UI/core-ui-change-request.md
```

## 10. 标准改造流程

Core UI 收敛任务必须拆阶段：

1. 写阶段 MD，明确只处理一个对象，例如 Toolbar、Picker、DataTable、Tag、FieldGrid。
2. KIMI 或执行 agent 只读当前阶段 MD 和必要 result/review MD。
3. 完成后写 `*-result.md`。
4. Codex/review agent 写 `*-review.md`。
5. 只修 review 指出的项，不碰下一阶段。
6. 全部通过后提交，保持 CWD clean。

推荐命令：

```bash
kimi -p "执行 /Users/koito/Desktop/UI/kimi-core-ui-phaseX-name.md，完成后写 result。"
kimi --continue -p "读取 /Users/koito/Desktop/UI/codex-review-phaseX-name.md，只修 review 指出的问题。"
```

## 11. 审计命令

Core Internal 业务直引：

```bash
rg "ActionButton|RefreshActionButton|CreateStartButton|CreateConfirmActions|DataTableActionsCell|createDataTableEditActions|getDefaultVisibleColumns|PickerShell|PickerOptionButton|ToolbarOptionGroup|SelectorCard|TreeNodeCard|TreeNodeBranch|TagPill|TagPillButton|TagRemoveButton|RemovableTag|InlineCreatePanel|BlockCreatePanel|ModalCreatePanel|DetailCreatePanel|SplitWorkspace|ModuleCardBody" packages --glob '!packages/core/**' -n
```

Foundation 业务直引：

```bash
rg "getFieldInputClassName|getReadOnlyFieldClassName|getTagInputShellClassName|getTagPillClassName|getTagInlineInputClassName|getFieldGridCellClassName|getFieldGridLabelClassName|getFieldGridValueClassName|getFieldGroupTitleClassName|getToolbarActionClassName|dataTableClassNames|moduleCardColorClasses|getModuleCardClassName" packages --glob '!packages/core/**' -n
```

业务重复 Toolbar：

```bash
rg --files packages | rg '/ui/.*Toolbar\.tsx$'
```

业务 Toolbar custom 绕行：

```bash
rg 'kind:\s*"custom"' packages app --glob '!packages/core/**' -n
```

旧层级残留：

```bash
rg "CoreUiComponentTier|coreUiComponentTierMeta|旧层级|tierValue|TIER_OPTIONS|TIER_ORDER|\\btier\\b" packages/core packages/platform scripts -n
```

期望：前三组无业务违规；Toolbar custom 全局无结果；旧层级残留无结果。
