# Core UI Registry 治理

Core UI 是整个产品的公共视觉和交互接口。业务页、Platform 页和 agent 不能按局部需求随手复制基础控件；所有通用 UI 都必须通过 Core UI registry 收口。

## 1. Registry 模型

| 字段 | 用途 | 业务/agent 可直接使用 |
|---|---|---|
| `declares` | 业务/Agent 可声明字段，例如 `control`、`valueType`、`options`、`kind` | 是，且是 `/settings/ui` 唯一自动收录口径 |
| `contract` | 由类型生成的完整契约树 | 不作为 UI 组件库收录口径 |
| `capabilities` | 非声明式服务能力说明，例如 feedback | 不作为 UI 组件库收录口径 |
| `composes` | 内部使用了哪些 Core 能力 | 不直接 import |
| `name/description` | 注册名和中文说明 | 作为 registry 基本事实 |

旧 `category/subcategory`、`role`、`exposure`、`verified` 字段已删除，不再作为分类、筛选、展示或 gate 依据。`/settings/ui` 的分类由声明视图派生，目前只有 `页面布局`、`页面内容`、`通用` 三类。

## 2. Agent 使用规则

普通 Feature/Data/Operations agent：

- Toolbar 规则另见 `docs/engineering/core-toolbar.md`；该文档是所有页面级工具栏的专门规范。
- 业务只 value import 明确允许的公共 runtime 入口和 helper；二级声明组件通过 `PageSurface` / `InputSurface` 等 spec 表达，不作为业务直接 renderer。
- `PageSurface.body` 只接收 `BodySurfaceProps`。`FormSurface`、`DataSurface`、`DocumentSurface`、`VisualizationSurface`、`MetricsSurface`、`RecordSurface`、`SelectorSurface` 都通过 `BodySurface` 声明；正文 section tree、tabs/grid/split、局部 commands/empty/modals 归 `BodySurface kind="section"`。页面级导航、toolbar、分页必须通过 `PageSurface.navigation`、`PageSurface.toolbar`、`PageSurface.footer` 表达。
- 新增页面代码必须使用 `PageSurface.body` 和 `PageSurface.navigation`。顶层 `blocks`、`empty`、`actions`、`tabs`、`activeTab`、`activeChild`、`onTabChange`、`onChildChange` 仅为存量兼容入口，不作为新代码 API。
- `@workspace/core/ui` 的 type-only import 只允许 Surface contract 类型、helper 类型和业务别名：`DataSurface*`、`FormSurface*`、`PageSurface*`、`SelectorSurface*`、`ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。业务不得再 type-only 直引底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；分别使用 Surface contract、`SurfaceToolbarItem(s)`、`ReferenceOption`。
- 不直接 import 未列入公共 runtime 入口的 renderer 作为业务组件；过渡期只允许 Surface contract / helper / business alias type-only 引用。
- 不直接 import `Core Internal`、`Foundation`、`Private Impl`。
- 不新增业务包 `Toolbar`、`Picker`、`Select`、`Search`、`Table`、`Modal`、`DateInput`、`Pagination`、`Tab` 等重复基础 UI。
- 业务页不得在 Surface spec 中塞 `custom` 渲染自定义控件；例如 toolbar/action spec 禁止 `kind: "custom"`。`custom` 和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则。
- `PageSurface` 的 `moduleView` 和 `BlockSurface kind="content"` 都是历史过渡逃生口，不是新增页面 API。存量 `moduleView` 已迁完，`businessModuleViewUsages` baseline 当前为 0；存量 `BlockSurface kind="content"` 由 `pageSurfaceLayoutProtocolWarnings` baseline 约束，新增会被 `gate:ui` 阻止。逐项 disposition 以 `docs/engineering/core-ui-module-view-migration.md` 为准。`arch:surface-boundaries` 会阻止 Core UI 以外源码重新新增 `moduleView`、`DataSurface.raw`、旧 `DataSurface kind="visual"`。
- 纸面/A4/报告类内容使用 `BodySurface kind="document"`，由 Core `DocumentSurface` 管理文档宿主、宽度、字体和多页容器；图表、甘特、时间轴、组织图等复杂图形使用 `BodySurface kind="visualization"`；通用 section/panel/message/empty/actions 使用 `BodySurface kind="section"`。业务不得再用 `moduleView` 或 `FormSurface.note` 承载复杂正文。
- 正文 Surface 的 `kind` 必须是一级 discriminant。选择 `DocumentSurface kind="pages"` 后，纸面列表只写入 `pages.items`；选择 `VisualizationSurface kind="chart"` 后，图表声明只写入 `chart.visual`，选择 `kind="gantt"` 后，甘特声明只写入 `gantt.timeline`。标题、外框、空态等细节进入对应 kind 的 payload，不再作为 Surface 顶层共享可选字段。
- 发现现有 Page API 不够用时，先停下来写清缺口；由 Architecture/Core UI 任务补公开接口，再回业务页替换。
- Platform runtime 使用 Core UI 时同样只能走公共 runtime 入口、根级 `FeedbackProvider` 和纯非组件事件能力；系统专有菜单、系统壳和账号入口由 Platform 自己封装，不再保留 `PageShell` / `DropdownMenu` 直引例外。Agent 页面 UI 已停用，仅保留 API / bot 接入能力。

Architecture/Core UI agent：

- 可以修改 `packages/core/ui/**`、Core UI registry、`/settings/ui` 声明能力页和治理脚本。
- 必须使用 `CORE_UI_CHANGE=1` 明确授权本次是 UI-system 任务。
- 必须同步更新 registry、导出、声明关系和相关治理文档。
- 必须保持 `npm run arch:gate`、`npm run lint:changed`、`npm run typecheck:quick` 无豁免通过。

Review agent：

- 优先检查业务页是否绕过 Page API。
- 优先检查 Core UI 新增/删除是否同步 registry、导出、声明关系和文档。
- 重点审查是否有人为了过 gate 随手新增 Core UI registry、页面/API/resource registry 或 baseline；注册项必须对应真实可复用入口，不能只为单页手搓组件背书。
- 重点审查重复和可拆除项：只为展示存在、没有业务消费、或与现有 Toolbar/Picker/Table/Modal/Page Frame 重叠的组件，应要求删除、合并或下沉到既有入口。
- 重点审查业务是否直接 import `SelectorList`、`SelectorTree`、`SelectorCard`，或手写 `PanelCard + Selector*` 作为左侧选择区；业务应改用 `SelectorSurface` spec，再由 `BodySurface kind="section" layout="split"` 的 `left` 承载。
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

Page Frame 只作为 Core 内部页面骨架能力，不再维护单独成熟度字段；是否能被业务/agent 使用由公共 runtime 入口白名单和 registry 决定。

## 5. Page API / Surface

Core UI 声明分类只服务 `/settings/ui` 和 agent 阅读，不再写入 registry entry：

| 分类 | 说明 |
|---|---|
| 页面布局 | `PageSurface` 及页面级 layout/navigation/toolbar/footer 声明。 |
| 页面内容 | `DataSurface` / `FormSurface` / `DocumentSurface` / `VisualizationSurface` / `MetricsSurface` / `RecordSurface`。 |
| 通用 | `InputSurface`、`SelectorSurface`、`BlockSurface` 等其他有 `declares` 的封装。 |

页面布局协议固定为五段：

1. `header`：页眉，默认页面必须有；登录页等特殊页面可显式 `hidden`。
2. `navigation`：页面级声明式导航段。L1/L2 模块入口属于 route/module 层或模块入口卡片，不放进 `TabBar`；`TabBar` 只承载当前页面内部视图切换，也就是 L3 及以下。
3. `toolbar`：页面级唯一工具栏。搜索、筛选、字段切换、刷新、导出、新建、生成等都必须表达为标准 toolbar item。
4. `body`：正文，只接收 `BodySurfaceProps`。业务正文由 `BodySurface.kind` 决定 `data/form/metrics/record/document/visualization/selector/section/navigation` 分类；split 是 `BodySurface kind="section" layout="split"`，左右两侧都接 `BodySurfaceProps`。PageSurface 不再声明 complete/split 正文协议。
5. `footer`：页脚；表格/数据分页只能在 `PageSurface.footer.pagination`。

`PageSurface.kind="login"` 和 `PageSurface.kind="directory"` 是封闭特殊页。一旦选择这两个 kind，就不能再走 standard 的页面正文渲染、导航、toolbar、footer 或 split body；login 只承载登录页专属 content + login FormSurface contract，directory 只承载目录模块网格或目录空态。后续调整普通 Surface、BlockSurface、PageContent、section stack 或标准五段协议时，不得影响这两个特殊页的布局。

`NavigationRenderer`、`BodySurface`、`SelectorSurface`、`FormSurface`、`DataSurface`、`MetricsSurface`、`RecordSurface` 不决定页面位置。`NavigationRenderer` 归 `common.chrome`，只能是 PageSurface 内部 renderer 或正文 primitive；正文 Surface 只能通过 `BodySurface` 选择正文内容形态，不承载页面级 toolbar/pagination；`SelectorSurface` 只能作为 BodySurface 内容声明，不决定 split 外框、开合或比例。

正文 Surface 不声明页面外框。`framed` 只存在于 `BodySurfaceSectionSpec`，用于决定 section 是否带页面正文外框；`DataSurface`、`MetricsSurface`、`RecordSurface` 和 `VisualizationSurface` 不再包自己的 PanelCard，避免同一个 body 被两层 layout 同时裁决。

`Surface` 命名表示声明层，不表示业务可直接 renderer。当前 `PageSurface` 仍承担主要 runtime 入口；正文二级 Surface 通过 `BodySurface` 选择，不作为业务直引 renderer。`host` 目录当前为空，`internal` 不开放。

Core UI 文件按层放置。`packages/core/ui/` 根目录保留最常用的 Surface/runtime API 入口，例如 `PageSurface.tsx`、`BodySurface.tsx`、`DataSurface.tsx`、`FormSurface.tsx`、`BlockSurface.tsx`、`InputSurface.tsx` 和 `index.ts`；这些入口本身就是业务阅读和迁移时最稳定的门面，不强行为了分类再套一层目录。

- `packages/core/ui/`：Surface 声明类型，例如 `PageSurface.types.ts`、`DataSurface.types.ts`、`FormSurface.types.ts`、`SurfaceContractTypes.ts`。
- `packages/core/ui/helpers/`：声明构造 helper，例如 `page-surface-builders.ts`、`surface-compat-builders.tsx`。
- `packages/core/ui/services/`：非视觉服务入口，例如 `FeedbackProvider.tsx` / `useFeedback`。
- `packages/core/ui/host/`：预留宿主入口，当前只允许 README。
- `packages/core/ui/internal/`：内部 renderer/primitive 迁移目标；按对象继续细分，例如 `internal/action/`、`internal/common/`、`internal/create/`、`internal/data/`、`internal/form/`、`internal/input/`、`internal/page/`、`internal/selection/`、`internal/toolbar/`、`internal/visualization/`；业务不得直接 import。

根目录不再接收新的私有拆分文件；公开入口自己的 parts/types/renderers/styles 等实现细节应迁入 `internal/<object>/`，由根目录公开入口继续 re-export 或内部引用。

`InputSurface` 是字段语义入口，不是 renderer 选择器。业务只声明 `valueType`、`control`、`options`、`format`、`mask`、`state`、`validation`、`usage` 和 `dependencies`；Core 内部 resolver 决定实际使用 `TextField`、`SelectField`、`CalendarDateInput`、`FkFieldInput`、`SegmentedCodeInput` 等实现。新增字段不得写 `spec.editor`，分段编码统一写成 `control: "text"` + `mask.kind: "editableSegment"`，FK 搜索统一写成 `control: "reference"` + `options.source: "remote"`。

当前批准的新 Surface section helper：

- `createFormSection(key, surface)`：生成 `BodySurface kind="form"` section。低层 form wrapper。
- `createFieldsSection(key, fields, options)`：生成 `BodySurface kind="form"` + `FormSurface kind="fields/detail"` section。迁移普通表单正文。
- `createInlineFieldsSection(key, fields, options)`：生成 `BodySurface kind="form"` + `FormSurface kind="filters"` section。迁移筛选行、轻量 inline field 组。
- `createDocumentSection(key, surface)`：生成 `BodySurface kind="document"` section。迁移纸面、A4、报告、QC 预览。
- `createVisualizationSection(key, surface)`：生成 `BodySurface kind="visualization"` section。迁移图表、甘特、时间轴、组织图。
- `createBlockSurfaceSection(key, surface)`：生成 `BodySurface kind="section"` + `BlockSurface`。迁移 section、panel、message、empty、actions、module grid 等通用区块。
- `createPageBody(sections, options)`：生成 `BodySurface kind="section"`，正文空态写入 `options.empty`，正文短命令写入 `options.commands`。新增代码不得再写顶层 `blocks` / `empty` / `actions`。
- `createBodySplitSection({ left, drawerLeft, right, side, layout })`：生成 `BodySurface kind="section" layout="split"`；左右两侧都接 `BodySurfaceProps`，左侧可以是 `kind="selector"`，也可以是普通 section/data/form/document 等正文。
- `createTabbedPageBody(sections, { active, onChange, ...options })`：生成带正文 tabs sectioning 的 `PageSurface.body`；tab 与正文 section 通过同一个 `section.key` 对齐，不新增 `tabKey` / index 映射。
- `createPageTabsNavigation(options)`：生成 `PageSurface.navigation kind="tabs"`。新增代码不得再写顶层 `tabs` / `activeTab` / `activeChild` / `onTabChange` / `onChildChange`。
- `createPageTableSection(key, table)`：生成 `PageSurface` 的 `data.table` section。迁移业务 `<DataSurface kind="table" ... />` 时优先使用。
- `createPageDataSection(key, surface)`：生成 `BodySurface kind="data"` section。只用于 `table` 和 `structured`；图形用 `createVisualizationSection`，指标用 `createMetricsSection`，可展开记录用 `createRecordSection`。遇到未声明的 React 内容时，先补正式 Surface spec 或 helper；不得新增 `BlockSurface kind="content"`。
- `createPageModalSection(key, modal)`：生成 BodySurface modal section，modal 内容继续用 typed sections。
- `createActionsSection(key, actions)` 与 `createPageCommand(command)`：生成通用动作 section。迁移用 `FormSurface kind="inline"` 只承载按钮的历史写法。`createPageActionsSection` 仅为兼容 alias，不再作为推荐入口。
- `createPageSurfaceProps(options)`：给 route/module thin adapter 生成非 split `PageSurface` props。AppShell 迁移使用它表达 header/body/toolbar/footer，不和 form/data 清债混在一起。

旧 `createPageFieldsBlock`、`createPageInlineFieldsBlock`、`createPageFormBlock`、`createPageFormModalBlock` 已删除；新增和存量迁移都使用不带 `Page` 前缀的 Surface helper。

这些 helper 只能返回 spec，不渲染组件、不读取业务事实、不依赖 Platform。业务可以 import helper 生成 spec，但最终渲染仍必须经过 `PageSurface`。

L2/L3 组件可以在 UI component library 中用于关系图、阅读和迁移，但业务包与 `app/(modules)` 不得 runtime import 它们。历史的 Page API 名称只能作为 Surface 的内部实现、showcase 可见层、兼容迁移说明或 type-only 引用。

所有 Page API registry entry 必须满足：

- 在 registry 中登记。
- 有中文 `description`。
- 有 `/settings/ui` 预览；复杂组件需要覆盖关键参数。
- props 契约稳定。
- 不暴露内部样式 recipe 或内部部件给业务页。

典型 L2/L3 可见能力层：

- 页面/布局：`PageShell`、`PageContent`、`PanelCard`、`SectionCard`、`WorkspaceSplitPage`
- Chrome/动作：`Toolbar`、`TabBar`、`Pagination`、`CommandButton`
- 数据：`DataTable`、`StructuredTable`、`TableScrollFrame`；分析图表通过 `VisualizationSurface kind="chart"` 的纯数据 spec 表达
- 表单：`FormField`、`TextField`、`SelectField`、`CalendarDateInput`、`TimeField`、`FieldGrid`
- 选择：`OptionPicker`、`SelectorPanel`；业务/agent 通过声明接口或 helper 表达选择区，`SelectorPanel` direct import 已禁止
- 输入/展示：`TagListInput`、`Badge`、`CodeBlock`、`EmptyStateCard`
- 反馈：`ConfirmModal`、`Toast`

Surface 使用红线：

- 业务代码不直接 import `Toolbar`、`PanelCard`、`DataTable`、`SelectField`、`ConfirmModal`、`SelectorPanel`、`CreatePanel` 等 renderer；通过公共 runtime 入口、helper 或 Surface spec 表达。
- 业务 type-only 不直接 import 底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；使用 Surface contract 或业务别名 `ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。
- Surface 内部的 `Toolbar` 只能接收语义化 item：`create`、`search`、`field-filter`、`option-group`、`column-toggle`、`page-size`、`text`、`icon-button`、`action-group`、`edit-group` 等。
- 业务传给 Surface 的 toolbar/action spec 禁止使用 `kind: "custom"` 拼装搜索、筛选、统计、分页、动作或任意自定义节点。
- 如果现有语义 spec 不够表达业务需要，必须扩展对应 Surface/helper 或 Core 能力，并写入 special-to-be-reviewed 说明等待 Core UI 评审；不得用 `custom` 临时绕过。
- Core 内部或明确 UI-system 任务也不得恢复 `ToolbarCustomItem`；临时验证应扩展标准 item 或使用非 Toolbar 的普通容器。
- Surface 内部 toolbar 的 `option-group` 默认是 micro accordion；普通 agent 不要把长分段筛选常驻铺开。
- 业务侧左侧列表、目录树和选择区应通过 `SelectorSurface` 声明接口/helper 表达；页面级导航和流程步骤通过 `PageSurface.navigation` 表达。`NavigationRenderer`、`SelectorPanel`、`SelectorList`、`SelectorTree`、`SelectorCard` 是 L2/L3 或 Core 内部组合件，不作为页面布局入口。

## 5.1 Hygiene-Cap Migration Recipe

历史 `FormSurface` / `DataSurface` direct import 按以下顺序清：

1. 组件已经在父级 `PageSurface` 内：把子组件改为返回 `BodySurfaceSectionSpec` 或 section 数组，父级用 `createPageBody(sections)` 接入。`DataSurface` 用 `createPageTableSection` / `createPageDataSection`；`FormSurface` 用 `createFieldsSection` / `createInlineFieldsSection` / `createFormSection`；图表/甘特用 `createVisualizationSection`；普通容器用 `createBlockSurfaceSection`。
2. 子组件目前直接返回表格或表单 JSX：先改成 thin section builder，例如 `buildXxxTableSection()` / `buildXxxFormSection()`；调用方负责放进 `PageSurface.body`。不要新增 domain `*Surface` 或 `*Shell`。
3. 历史 `FormSurface kind="modal"` 已从类型层删除；弹窗统一迁移到 `createPageModalSection`，modal 内容使用 `createFieldsSection` 或 `createFormSection`。
4. 历史 `FormSurface kind="inline"` 只承载按钮：迁移到 `createActionsSection`，按钮使用 `createPageCommand` 或直接写 `BlockSurfaceCommandSpec`。
5. `InputSurface` 是通用声明入口；`SelectorPanel`、`CreatePanel` 是 renderer，业务通过 `createSelectorPanelSection`、`createCreatePanelSection` 或后续更明确的 selection/create Surface 声明。

Platform Core UI direct import 按以下 recipe 清：

1. `PermissionCell` 这类 inline action：使用 `PageSurface` embedded + `createActionsSection`，或在上级 table cell spec 中返回 `DataSurfaceCellSpec kind="action/actions"`。
2. `AuditLogModal`、`NotificationBell` 这类 overlay：外层 overlay 可以保留 Platform 专有行为；内部筛选、分页、表单内容用 `createFieldsSection`、`createPageModalSection`、`PageSurface.footer.pagination` 表达。
3. Admin tabs 的表单/表格：和业务 109 同样迁到 `PageSurface` blocks；不要为了系统页重新开放 `FormSurface` / `DataSurface`。

28 个 `AppShell` primitive 是页面壳迁移债，单独处理：

1. route/page 层保留鉴权和模块事实，生成 `PageSurface` props；不要把 AppShell 注册为 Core/Page API。
2. 使用 `createPageSurfaceProps` 表达 `header/title/backHref/body/toolbar/footer`。用户菜单、通知铃、logo 仍由 Platform thin adapter 提供为 `header.leading/actions`，不进 Core。
3. 每个 URL 只保留一个页面级 `PageSurface`。子模块如果需要独立内容，返回 typed blocks 或嵌入式 `PageSurface`，不能通过 provider 反向注册 toolbar/navigation。

新增 Page API 时必须同步：

1. `packages/core/ui/<Name>.tsx`
2. `packages/core/ui/index.ts`
3. `packages/core/ui/registry/component-registry-data-*.ts`
4. 必要时更新 `docs/engineering/core-ui-governance.md` 或 `docs/engineering/reusable-components.md`

新增会进入 `/settings/ui` 的封装组件必须有明确 `declares`；若声明项过多或高度耦合，应拆新的 Surface。基础/私有实现不得作为业务 import。

新增或迁移 registry entry 时必须填写中文 `description`，公共声明入口补 `declares`，内部组合关系写 `composes`。`arch:surface-boundaries` 会 warning：声明项过厚或跨声明分类组合异常。结构性 UI 项进入 `gate:ui`，简单清扫项进入 `check:hygiene`；不能为了消警把 domain shared shell 注册成 Core/Page API。

`arch:surface-page-adoption` 专门扫描业务 JSX 和 `createPageSurfaceProps` 中的 PageSurface 顶层兼容入口：`blocks`、`empty`、`actions`、`tabs`、`activeTab`、`activeChild`、`onTabChange`、`onChildChange`。这些不是新代码 API，只能作为迁移债出现在 warning；新增/迁移代码必须改到 `body`、`navigation`、`toolbar` 或对应 helper。

`arch:surface-visualization-adoption` 专门扫描 `VisualizationSurface.kind="gantt"` 里的 `content` ReactNode。甘特、时间轴、组织图这类复杂可视化必须逐步升级成 typed spec 或专用 Surface；整块业务组件塞进 visualization content 只能作为短期迁移债。

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

例外：`ActionGlyph` 是全局唯一的 SVG/action icon 封闭表。动作、状态、权限来源这类 UI 图标必须先注册到 `ActionGlyph`，再由页面 API、Surface spec、平台 wrapper 或少数 icon-only cell 使用；不得在业务/平台文件里手写新的 `<svg>`。`ActionGlyph` 允许作为图标基础入口直接 import，但它不是业务 Surface/helper/service 入口，不允许借它绕开 Toolbar/PageSurface 的动作协议。

## 8. Private Impl

Private Impl 是公开 UI 自己拆出来的内部文件。它不注册为独立 UI，不出现在 `/settings/ui` 组件卡片里，不允许业务 import。

例子：

- `OptionPickerContent.tsx`
- `OptionPickerParts.tsx`
- `OptionPickerTypes.ts`
- `internal/toolbar/Toolbar.parts.tsx`
- `internal/toolbar/Toolbar.types.ts`
- `internal/data/DataTable.types.ts`

Private Impl 修改等同于修改所属公开 UI，必须按 Core UI-system 任务处理。

## 9. 硬约束

本地提交前：

- `.githooks/pre-commit` 会运行 `scripts/check/check-core-ui-guard.js --staged`。
- 未授权修改 core UI / registry / `/settings/ui` 声明页会失败。
- 新增业务包 `*Toolbar.tsx` 会失败。
- 新增 `eslint-disable` 会失败。
- 新增或删除 core UI 但 registry/export 未同步会失败。

收口/CI：

- `npm run arch:gate` 会运行 Core UI guard、registry relation validation、structure ratchet 和 package boundary。
- 非公共 runtime Core UI 业务直引、新增未注册 Core UI、重复 registry、页面设计漂移、重复基础 UI 都必须由 gate 或 baseline ratchet 拦住。
- 业务 UI 和 `app/(modules)` 默认只能使用公共 runtime 入口、helper 或 Surface spec；`NavigationRenderer`、`Toolbar`、`TabBar`、`Pagination` 等 renderer 只能由 Core 内部实现使用。新增绕过由 `gate:ui` 阻断，存量迁移需要对应 Feature/Architecture 负责，不交给 Hygiene 重构。
- 业务 UI 和 `app/(modules)` 新增 `PageSurface` `moduleView` block 会进入 `businessModuleViewUsages` ratchet；该 baseline 当前为 0，新增即失败，必须迁移到 typed block / Surface spec。
- Platform UI 只能使用公共 runtime 入口、根级 `FeedbackProvider` 和纯非组件事件能力；其他 Core UI renderer 直引由 `platformCoreUiRoleBypassImports` baseline 锁定，baseline 必须保持为空，`PageShell` / `DropdownMenu` 不再作为系统壳例外。
- baseline 只能减少，不能把新增违规写入 baseline。
- 大规模 UI 迁移前后必须阅读或运行 Core UI governance checks，确认 L1/L2/L3/L4 展示层级、registry 关系、`businessCoreUiRoleBypassImports`、`businessModuleViewUsages` 和 `platformCoreUiRoleBypassImports` baseline 都在收敛；长期迁移按阶段定期复查，而不是等最后一次性补 gate。

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
