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
- `PageSurface.body` 只接收 `BodySurfaceProps`。`FormSurface`、`DataSurface`、`DocumentSurface`、`VisualizationSurface`、`SelectorSurface` 都通过 `BodySurface` 声明；数据表格、结构化数据、摘要指标和可展开记录归 `DataSurface`。正文 section tree、grid/split、局部 commands/message/status/empty/modals 归 `BodySurface kind="section"`；section grid 可声明 `gridColumns: 2 | 3`，长章节可声明 `mobilePresentation: "drilldown"`，由 Core 在手机端渲染为章节目录到单章节的渐进流程。普通 DataSurface 表格在手机端渲染连续列表，矩阵默认进入 `MobileExperienceBoundary` 横屏工作台；完整策略见 `docs/engineering/mobile-experience.md`。确需针对同一业务状态提供不同信息架构时，section 可声明 `visibility: "mobile" | "desktop"`，但两侧必须复用同一数据和动作协议，不能借响应式分支复制业务状态。section 可通过结构化 `disclosure.expanded / onExpandedChange` 声明折叠面板，同层共用一个 active key 时形成互斥折叠组；这与 `PageSurface.tabbar` 的 parent/children accordion Tab 是两种能力。页面级 tabs、toolbar、分页必须通过 `PageSurface.tabbar`、`PageSurface.toolbar`、`PageSurface.footer` 表达；弹窗分页只能使用 `BodySurfaceModalSpec.pagination`。
- `BodySurface` 列表的 `presentation: "cards"` 只允许声明 `title / description / badges / actions` 等结构化内容，card item 禁止 `label` 和 `meta` 独立行。状态使用 badge，事实型补充信息并入 description；禁止用第三行静态说明文案制造隐式 label。
- 新增页面代码必须使用 `PageSurface.body` 和 `PageSurface.tabbar`。旧顶层 `blocks`、`empty`、`actions`、`tabs`、`activeTab`、`activeChild`、`onTabChange`、`onChildChange` 已从协议删除，不得恢复。
- `@workspace/core/ui` 的 type-only import 只允许 Surface contract 类型、helper 类型和业务别名：`DataSurface*`、`FormSurface*`、`PageSurface*`、`SelectorSurface*`、`ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。业务不得再 type-only 直引底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；分别使用 Surface contract、`SurfaceToolbarItem(s)`、`ReferenceOption`。已有 selector 节点的轻量重命名使用 `SelectorSurface card.inlineEdit`，不得另开业务弹窗或直接渲染输入框。
- 不直接 import 未列入公共 runtime 入口的 renderer 作为业务组件；过渡期只允许 Surface contract / helper / business alias type-only 引用。
- 不直接 import `Core Internal`、`Foundation`、`Private Impl`。
- 不新增业务包 `Toolbar`、`Picker`、`Select`、`Search`、`Table`、`Modal`、`DateInput`、`Pagination`、`Tab` 等重复基础 UI。
- 业务页不得在 Surface spec 中塞 `custom` 渲染自定义控件；例如 toolbar/action spec 禁止 `kind: "custom"`。`custom` 和手搓 UI 没有本质区别，会绕过 Core 的尺寸、字号、排序、对齐、预览和审计规则。
- Surface 公共声明不得新增 raw/custom content 槽，包括 `content: ReactNode`、`cell(row) => ReactNode`、`expandedRowContent`、`renderItem`、`renderOption`。表格展开内容使用结构化 `expandedRow`；确实缺能力时扩展结构化 Surface spec。
- `PageSurface.moduleView` 和旧 `kind="content"` React 正文逃生口都不是新增页面 API。存量 `moduleView` 已迁完，`businessModuleViewUsages` baseline 当前为 0；旧 content escape 已迁完，`pageSurfaceLayoutProtocolWarnings` baseline 当前为 0。`gate:ui` / `arch:surface-boundaries` 会阻止 Core UI 以外源码重新新增 `moduleView`、`DataSurface.raw`、旧 `DataSurface kind="visual"`。
- 纸面/A4/报告类内容使用 `BodySurface kind="document"`，由 Core `DocumentSurface` 管理文档宿主、宽度、字体和多页容器；图表、甘特、时间轴、组织图等复杂图形使用 `BodySurface kind="visualization"`；通用 section/panel/message/empty/actions 使用 `BodySurface kind="section"`。业务不得再用 `moduleView` 或 `FormSurface.note` 承载复杂正文。
- 正文 Surface 的 `kind` 必须是一级 discriminant。选择 `DocumentSurface kind="pages"` 后，纸面列表只写入 `pages.items`；选择 `kind="viewer"` 后，阅读器只声明 `viewer.src/title`，由 Core 提供自适应的内嵌文档宿主。PDF、ONLYOFFICE 等提供方的鉴权、签名、配置、回调和权限映射留在 Platform 或业务适配层，不进入 Core 协议。选择 `VisualizationSurface kind="chart"` 后，图表声明只写入 `chart.visual`，选择 `kind="gantt"` 后，甘特声明只写入 `gantt.timeline`。标题、外框、空态等细节进入对应 kind 的 payload，不再作为 Surface 顶层共享可选字段。
- `VisualizationSurface kind="network"` 只接受节点、边、分组和语义化布局声明。未声明 `layout` 时保持汇流布局；`layout.kind="converging"` 表示上游分组/节点先汇入焦点，再展开下游树；`layout.kind="hierarchy"` 表示从焦点直接向下展开，不生成上游汇流区。`layout.nodeAspect="adaptive"` 只授权 Core 在宽层级中把适合的短标题节点改为纵向形态，不允许业务传节点宽高、坐标或折线。`layoutOrder` 只保存真实来源顺序；未声明顺序的节点由 Core 按占用空间居中安排。
- 发现现有 Page API 不够用时，先停下来写清缺口；由 Architecture/Core UI 任务补公开接口，再回业务页替换。
- Platform runtime 使用 Core UI 时同样只能走公共 runtime 入口、根级 `FeedbackProvider` 和纯非组件事件能力；系统专有菜单、系统壳和账号入口由 Platform 自己封装，不再保留 `PageShell` / `DropdownMenu` 直引例外。Agent L1 使用公开的 `PageSurface` / `BodySurface` contract，不建立专用 Core kind。
- 纯数据 helper 不拥有可见 UI 或流程决策。UI agent 可以维护显式类型的结构声明函数：它可以一次声明完整的 section、表单组、表格、selector、展开工作区或深模块 cell，并拥有该结构内的语义文案、状态与动作；非标准返回类型用 `@ui-structural-declaration` 标明。禁止把声明细碎化成单个字段、普通单元格、单个 label/icon，也禁止声明颜色、间距、圆角、阴影、renderer 或动作位置/排序。结构声明不得执行 fetch/toast/confirm/router/history 等构造期副作用；事件回调中的业务动作不算构造期副作用。
- `@ui-specialized-surface` 不是业务逃逸口，只能出现在 Gate 精确登记的深模块实现中。目前登记文档工作区、阶段流程板、企业微信登录面板、Page Assistant composer/message stream、Workflow BPMN canvas/element editor 与 Production QC runtime paper。业务页面不得自行声明。企业微信登录 seam 只拥有官方第三方 iframe 的客户端生命周期；QC 纸面字段统一走 Core `PaperInputSurface`；Page Assistant 两个 seam 分别只拥有消息输入行为与消息/提案渲染；BPMN 两个 seam 分别只拥有第三方画布适配与图元素编辑。新增或扩大范围必须再次通过 UI/Architecture 评审。未声明的 JSX `content`、JSX cell、`expandedRowContent`、`renderItem/renderOption` 会被 `gate:ui` 直接阻断。

Architecture/Core UI agent：

- 可以修改 `packages/core/ui/**`、Core UI registry、`/settings/ui` 声明能力页和治理脚本。
- 必须使用 `CORE_UI_CHANGE=1` 明确授权本次是 UI-system 任务。
- 必须同步更新 registry、导出、声明关系和相关治理文档。
- 必须保持 `npm run arch:gate`、`npm run lint:changed`、`npm run typecheck:scope -- core` 无豁免通过；下游全图由 CI/发布验证。

Review agent：

- 优先检查业务页是否绕过 Page API。
- 优先检查 Core UI 新增/删除是否同步 registry、导出、声明关系和文档。
- 重点审查是否有人为了过 gate 随手新增 Core UI registry、页面/API/resource registry 或 baseline；注册项必须对应真实可复用入口，不能只为单页手搓组件背书。
- 重点审查重复和可拆除项：只为展示存在、没有业务消费、或与现有 Toolbar/Picker/Table/Modal/Page Frame 重叠的组件，应要求删除、合并或下沉到既有入口。
- 重点审查业务是否直接 import `SelectorCard`，或手写 `PanelCard + SelectorCard` 作为主选择区；业务应改用 cards-only `SelectorSurface` spec，再由 `BodySurface kind="section" layout="split"` 的 `master.body` 承载。
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

页面级全局组件是例外中的另一类稳定规格组件：AppShell header、PageSurface tabbar/toolbar/body/footer 本身定义页面结构，不应被正文、表格或字段 context 反向改变尺寸。引用方只能选择 Core 暴露的语义档位，不得手写尺寸覆盖。

### 3.3 父子职责

父级/引用主体负责声明“你在我这里是什么”：

- Toolbar 声明子控件处于 `intrinsic`。
- 表格、批量录入、纸面表单声明子控件处于 `parentLocked`。
- 详情页字段区声明子控件跟随详情页字段 context，并在同一区域内保持一致。
- 详情页字段区需要承载头像、图片等高内容时，字段项使用 `rowSpan: 2 | 3` 让该单元格跨行；不要在业务页用局部缩小、绝对定位或额外手写网格修补行高。
- 系统反馈组件才允许 `selfLocked`。
- 页面级全局组件使用自身稳定规格；正文 context 不影响它们，引用方只选语义档位。

子 UI 负责实现“在该 context 下怎么长”：

- `SearchableOptionInput` 自己适配输入框、option、dropdown 的字号、padding、行高。
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
| 页面内容 | `BodySurface`、`CreateSurface`、`DataSurface`、`DocumentSurface`、`FormSurface`、`PaperInputSurface`、`SelectorSurface`、`VisualizationSurface`。`BodySurface` section 的 `disclosure` 提供折叠面板结构。 |
| 通用 | `NavigationSurface`、`InputSurface` 两个跨正文复用的声明。 |

页面布局协议固定为五段：

1. `header`：页眉，默认页面必须有；登录页等特殊页面可显式 `hidden`。
2. `tabbar`：页面级声明式 Tab 段。L1/L2 模块入口属于 route/module 层或模块入口卡片，不放进 `TabBar`；`TabBar` 只承载当前页面内部视图切换，也就是 L3 及以下。父项声明 `children` 时由 Core 以 accordion 方式在选中父 Tab 后同栏展开子 Tab，并通过 `activeChild / onChildChange` 控制。
3. `toolbar`：页面级唯一工具栏。搜索、筛选、字段切换、刷新、导出、新建、生成等都必须表达为标准 toolbar item。
4. `body`：正文，只接收 `BodySurfaceProps`。业务正文由 `BodySurface.kind` 决定 `create/data/form/document/visualization/selector/section` 分类；标准新建流归 `CreateSurface`，数据摘要指标和可展开记录归 `DataSurface`，正文 empty/loading/error 归 `BodySurface kind="section"` 的 `status`。split 是 `BodySurface kind="section" layout="split"`，左右两侧都接 `BodySurfaceProps`。
5. `footer`：整页页脚；全宽表格/数据分页在 `PageSurface.footer.pagination`，`BodySurface` split 主列表分页在 `master.footer.pagination`。

`PageSurface.kind="login"` 和 `PageSurface.kind="directory"` 是封闭特殊页。一旦选择这两个 kind，就不能再走 standard 的页面正文渲染、导航、toolbar、footer 或 split body；login 只承载登录页专属 content + login FormSurface contract，directory 只承载目录模块网格或目录空态。后续调整普通 Surface、PageContent、section stack 或标准五段协议时，不得影响这两个特殊页的布局。

`NavigationSurface` 是 Core 内部 renderer，由 `PageSurface.tabbar`、`PageSurface.footer.pagination`、`BodySurface` split 的 `master.footer.pagination`、`BodySurfaceModalSpec.pagination` 和 AppShell context selector 的公开 Interface 调度。正文 Surface 只能通过 `BodySurface` 选择正文内容形态，不自行承载页面级 toolbar/pagination；split 主列表是唯一可由 `master.footer.pagination` 声明的正文分页位置。`SelectorSurface` 只能作为 BodySurface 内容声明，不决定 split 外框、开合、比例或分页位置。FormSurface 可以拥有自身固定的表单标题与生命周期动作栏，但这只是表单内部结构，不是页面 toolbar，也不允许调用方指定位置。

正文 Surface 和业务 section 都不声明页面外框。`BodySurfaceSectionSpec` 不暴露 `chrome/framed` 开关：Core 根据 section 的层级和结构统一派生外观，顶层有标题或动作的标准 section 使用 card，无标题结构容器和 CreateSurface 宿主保持透明，card 内的有标题子 section 使用 divider。`DataSurface` 和 `VisualizationSurface` 不再包自己的 PanelCard，避免同一个 body 被两层 layout 同时裁决。

`Surface` 命名表示声明层，不表示业务可直接 renderer。当前 `PageSurface` 仍承担主要 runtime 入口；正文二级 Surface 通过 `BodySurface` 选择，不作为业务直引 renderer。`host` 目录当前为空，`internal` 不开放。

Core UI 文件按层放置。`packages/core/ui/` 根目录保留最常用的 Surface/runtime API 入口，例如 `PageSurface.tsx`、`BodySurface.tsx`、`CreateSurface.tsx`、`DataSurface.tsx`、`FormSurface.tsx`、`InputSurface.tsx` 和 `index.ts`；这些入口本身就是业务阅读和迁移时最稳定的门面，不强行为了分类再套一层目录。

- `packages/core/ui/`：Surface 声明类型，例如 `PageSurface.types.ts`、`DataSurface.types.ts`、`FormSurface.types.ts`、`SurfaceContractTypes.ts`。
- `packages/core/ui/helpers/`：声明构造 helper，例如 `page-surface-builders.ts`。
- `packages/core/ui/services/`：非视觉服务入口，例如 `FeedbackProvider.tsx` / `useFeedback`。
- `packages/core/ui/host/`：预留宿主入口，当前只允许 README。
- `packages/core/ui/internal/`：内部 renderer/primitive 迁移目标；按对象继续细分，例如 `internal/action/`、`internal/common/`、`internal/create/`、`internal/data/`、`internal/form/`、`internal/input/`、`internal/page/`、`internal/selection/`、`internal/toolbar/`、`internal/visualization/`；业务不得直接 import。

根目录不再接收新的私有拆分文件；公开入口自己的 parts/types/renderers/styles 等实现细节应迁入 `internal/<object>/`，由根目录公开入口继续 re-export 或内部引用。

`InputSurface` 是字段语义入口，不是 renderer 选择器。业务只声明 `valueType`、`control`、`options`、`format`、`mask`、`state`、`validation`、`usage` 和 `dependencies`；Core 内部 resolver 决定实际使用 `TextField`、`SearchableOptionInput`、`CalendarDateInput`、`FkFieldInput`、`SegmentedCodeInput` 等实现。新增字段不得写 `spec.editor`，分段编码统一写成 `control: "text"` + `mask.kind: "editableSegment"`，FK 搜索统一写成 `control: "reference"` + `options.source: "remote"`。

`InputSurface` / `FormSurface` 字段的顶层 `disabled`、`readOnly` 必须与 `spec.state` 合并后再选择 renderer；文本、日期和时间控件使用原生只读语义，不支持 `readOnly` 的 choice、FK、checkbox、file、rating、tag 等交互控件必须以 disabled 阻断修改。任何 renderer 都不得吞掉调用方已经声明的不可编辑状态。

`FormSurface` 的必填状态由 Core 统一归一：字段 `required`、`InputSurface.validation.required` 或 `state: "required"` 任一声明，都必须同时生成必填星号、输入必填语义和保存/提交前校验；业务不得另外手写星号或只依赖服务端报错。

普通表格默认随页面自然展开，不创建横向或纵向内滚动。短名称、状态、比例、日期、来源等可压缩字段即使表头随页面滚出视口，仍应优先保持连续阅读；不要仅因行数多或担心表头消失就声明 `scroll`。只有二维矩阵、列内容确实不可压缩，或交互明确需要固定高度视窗时才声明滚动；固定高度视窗必须同时声明 `maxHeight`，由 Core 锁定表头。

业务状态类 Boolean 必须用 `control: "choice"` + 静态产品文案选项表达，并在回调边界还原为 `boolean`；`control: "boolean"` + `presentation: "checkbox"` 只用于明确的勾选/确认语义。Core 不提供 `switch` presentation，业务不得自行复刻开关 renderer。

多行文本需要随内容展开时声明 `autoGrow: true`，由 Core 根据内容与实际宽度维护高度并隐藏字段内滚动条；业务不得自行估算字符数或操作 textarea DOM。

`PaperInputSurface` 是独立纸面输入声明，与 `DocumentSurface` 同属页面内容能力。它只表达纸面内的 line/date/select/choice、纸面布局和填写状态；不得把下划线、纸张宽度、表格单元格定位等纸面语义重新塞回通用 `InputSurface`，Production/QC 也不得保留自己的单字段 renderer 入口。

当前批准的新 Surface section helper：

- `BodySurface kind="create"`：标准新建流，payload 为 `CreateSurface`。Agent 分别声明 `trigger: toolbar | surface`、`presentation: inline | block | modal`、普通 block 可选的跨区 `anchor` 与 `content: form | sections`。inline 在类型层固定为 Page toolbar + 单 form + 无 anchor；`BodySurfaceSectionHeaderSpec.create` 的局部 block 在类型层禁止 anchor，由 Core 自动紧贴 section header 并置于 body 前，因此表格新增固定出现在列头上方。需要点击标题行 `+` 后直接追加可编辑表格行时，section header 可声明 `presentation: "row"`；该变种只触发调用方的新增行状态，行内编辑和保存仍归 DataSurface/FormSurface。所有非 inline 组合复用同一 FormSurface grid renderer，modal、anchor、sections 均不得改变字段格式。每个 section 只声明 `key/title/items/layout`，不得反向传入 Body tree。
- 需要先选择创建类型时，只能增加 `flow.kind="two-stage"`：第一段只声明选择字段并自动进入第二段，不声明自己的 layout；Core 强制两段复用第二段 `form.layout` 和同一个 shell，第一段不显示保存/提交。
- `createFormSection(key, surface)`：生成 `BodySurface kind="form"` section。低层 form wrapper。
- `createFieldsSection(key, fields, options)`：生成 `BodySurface kind="form"` + `FormSurface kind="fields/detail"` section。迁移普通表单正文；表单标题写 `options.header`，保存、提交、取消、归档/取消归档、批准、拒绝等根动作写 `options.actions`。
- `createInlineFieldsSection(key, fields, options)`：生成 `BodySurface kind="form"` + `FormSurface kind="filters"` section。迁移筛选行、轻量 inline field 组；只有 filter command 可以使用 `options.commands` 与 `layout.commandPlacement`，不得借此承载表单生命周期动作。
- `createDocumentSection(key, surface)`：生成 `BodySurface kind="document"` section。迁移纸面、A4、报告、QC 预览。
- `createVisualizationSection(key, surface)`：生成 `BodySurface kind="visualization"` section。迁移图表、甘特、时间轴、组织图。
- `createPanelSection` / `createSectionSection` / `createMessageSection` / `createStatusSection` / `createEmptySection` / `createActionsSection` / `createModuleGridSection`：生成 `BodySurface kind="section"` 原生区块。迁移 section、panel、message、empty/loading/error status、empty、actions、module grid 等通用区块。
- `createPageBody(sections, options)`：生成 `BodySurface kind="section"`，正文空态写入 `options.empty`，正文短命令写入 `options.commands`。新增代码不得再写顶层 `blocks` / `empty` / `actions`。
- `createMasterDetailBody({ master, detail, desktop?, mobile? })`：生成 `BodySurface kind="section" layout="split"`。业务只声明 `master.label + master.body + detail`；主栏为实体/目录选择区时声明 `master.presentation="compact"`，Core 在桌面使用紧凑卡片并仅保留标题、编号、状态和一个辅助事实，移动端继续显示完整卡片；未声明 `desktop` 布局时，compact 主栏使用稳定固定侧栏，已有明确比例的工作区可继续声明 `desktop.ratio`。`PageSurface` 自动持有桌面折叠状态、派生唯一 toolbar 控制，并在手机端从主列表全屏推进到详情。不得在业务层重复声明卡片 `size`、字段裁剪、`sideOpen`、drawer 状态、折叠按钮或第二套移动端列表。
- `createPageTabBar(options)`：生成 `PageSurface.tabbar kind="tabs"`。新增代码不得再写顶层 `tabs` / `activeTab` / `activeChild` / `onTabChange` / `onChildChange`。
- `createPageTableSection(key, table)`：生成 `PageSurface` 的 `data.table` section。迁移业务 `<DataSurface kind="table" ... />` 时优先使用。
- `createPageDataSection(key, surface)`：生成 `BodySurface kind="data"` section。用于 `table`、`structured`、`summary` 和可展开 `record`；图形用 `createVisualizationSection`，指标摘要可用 `createMetricsSection` 兼容 helper，主体状态用 `createStatusSection`，可展开记录可用 `createRecordSection` 兼容 helper。遇到未声明的 React 内容时，先补正式 Surface spec 或 helper；不得新增 raw React content escape。
- `createPageModalSection(key, modal)`：生成 BodySurface modal section，modal 内容继续用 typed sections。
- `createActionsSection(key, actions)` 与 `createPageCommand(command)`：生成通用动作 section。标准动作命令按 `key` / `label` / `type` 自动使用 `ActionGlyph` 图标；确需文字按钮时显式声明 `presentation: "text"`。迁移用 `FormSurface kind="inline"` 只承载按钮的历史写法。`createPageActionsSection` 仅为兼容 alias，不再作为推荐入口。

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

- 页面/布局：Platform `AppShell` 与 Core `PageSurface` 是唯一页面壳；`PageContent`、`PanelCard`、`SectionCard` 仅为 Core 内部实现
- Chrome/动作：`Toolbar`、`TabBar`、`Pagination`、`CommandButton`
- 数据：`DataTable`、`StructuredTable`、`TableScrollFrame`；分析图表通过 `VisualizationSurface kind="chart"` 的纯数据 spec 表达
- 表单：`FormField`、`TextField`、`SearchableOptionInput`、`CalendarDateInput`、`TimeField`、`FieldGrid`
- 新建：业务/agent 只声明 `CreateSurface`；`InlineCreatePanel`、`CreatePresentationPanel`、`CreateStartButton` 和 `CreateConfirmActions` 都是 Core Internal
- 选择：普通选项使用 autocomplete，分组选项使用二段式 autocomplete；业务/agent 通过 cards-only `SelectorSurface` 声明接口表达选择区
- 输入/展示：`TagListInput`、`Badge`、`CodeBlock`、`EmptyStateCard`
- 反馈：`ConfirmModal`、`Toast`

Surface 使用红线：

- 业务代码不直接 import `Toolbar`、`PanelCard`、`DataTable`、`SearchableOptionInput`、`ConfirmModal`、`CreatePanel` 等 renderer；通过公共 runtime 入口、helper 或 Surface spec 表达。
- 业务 type-only 不直接 import 底层 `DataTableColumn`、`ToolbarItem`、`FkFieldOption`；使用 Surface contract 或业务别名 `ReferenceOption`、`SurfaceToolbarItem`、`SurfaceToolbarItems`。
- Surface 内部的 `Toolbar` 只能接收语义化 item：`create`、`search`、`field-filter`、`option-group`、`column-toggle`、`page-size`、`text`、`icon-button`、`action-group`、`edit-group` 等。标准编辑流通过 `edit-group.dirty` 声明是否存在实际修改；显式为 `false` 时 Core 统一禁用保存，业务不得发送空 PATCH 来探测修改状态。
- 业务传给 Surface 的 toolbar/action spec 禁止使用 `kind: "custom"` 拼装搜索、筛选、统计、分页、动作或任意自定义节点。
- 如果现有语义 spec 不够表达业务需要，必须扩展对应 Surface/helper 或 Core 能力，并写入 special-to-be-reviewed 说明等待 Core UI 评审；不得用 `custom` 临时绕过。
- Core 内部或明确 UI-system 任务也不得恢复 `ToolbarCustomItem`；临时验证应扩展标准 item 或使用非 Toolbar 的普通容器。
- Surface 内部 toolbar 的 `option-group` 默认是 micro accordion；普通 agent 不要把长分段筛选常驻铺开。
- 标准新建只声明 `CreateSurface`。`trigger="toolbar"` 由 PageSurface 派生唯一 Toolbar `+`，`trigger="surface"` 跟随所属 section/cell；`presentation` 与 trigger 正交，普通 block 可选跨区 anchor。section header 的 block create 不接受 anchor，Core 自动放在 header 后、body 前；直接追加可编辑行只用 section header 的 `presentation: "row"` 变种。调用方不得手工声明 `+`，不得通过 modal、anchor 或 sections 改变非 inline 表单格式，也不得声明动作样式、图标、标签或顺序。
- PageSurface 的 toolbar slot 全页唯一；BodySurface split 侧栏控制与 CreateSurface toolbar trigger 都只能派生 toolbar item，并由 PageSurface 一次性合并渲染。正文 Surface 不得拥有 `toolbar/toolbarItems` contract，也不得在 implementation 中渲染 `<Toolbar>`。
- `FormSurfaceActionSpec` 只声明动作语义和行为，不开放 `icon / variant / size / presentation / section / order / commandPlacement`。Core 根据 `ACTION_GLYPH_ACTIONS` 和 `ACTION_GLYPH_ORDER` 固定图标、样式、位置与顺序；`unarchive` 统一使用 restore glyph。
- `FormSurface.submit` 只由同一表单的主 `save` / `submit` action 驱动：Enter 提交必须复用该 action 的 disabled 状态（包括 pending、校验和权限结果）；主 action 缺失或被禁用时不得调用 `onSubmit`。带 `onClick` 的 action 使用普通 button，避免点击时同时触发 action 与原生 form submit。
- `FormSurface.commands` 与 `commandPlacement` 仅允许 `kind: "filters"` 使用。普通字段、详情和登录表单不得用 command 表达根生命周期动作。
- 业务侧左侧列表、目录树和输入型选择区应通过 `SelectorSurface` 声明接口/helper 表达；页面 tabs 通过 `PageSurface.tabbar` 表达，AppShell header 的上下文切换由 Platform 拥有，弹窗分页通过 `BodySurfaceModalSpec.pagination` 表达。`NavigationSurface` 只是 Core 内部 renderer，不从公共入口导出。

## 5.1 Hygiene-Cap Migration Recipe

历史 `FormSurface` / `DataSurface` direct import 按以下顺序清：

1. 组件已经在父级 `PageSurface` 内：把子组件改为返回 `BodySurfaceSectionSpec` 或 section 数组，父级用 `createPageBody(sections)` 接入。`DataSurface` 用 `createPageTableSection` / `createPageDataSection`；`FormSurface` 用 `createFieldsSection` / `createInlineFieldsSection` / `createFormSection`；图表/甘特用 `createVisualizationSection`；普通容器用 `createPanelSection` / `createSectionSection` 等 section helper。
2. 子组件目前直接返回表格或表单 JSX：先改成 thin section builder，例如 `buildXxxTableSection()` / `buildXxxFormSection()`；调用方负责放进 `PageSurface.body`。不要新增 domain `*Surface` 或 `*Shell`。
3. 历史标准新建表单若由 Page toolbar、父 Section、Data cell 或旁路 action-group 托管保存/提交/取消，迁到 `CreateSurface`；删除页面显式 `create` 入口，用 `trigger` 声明 Toolbar 或所属 Surface，用 `presentation` 声明 inline/block/modal，并按需给 block 声明 typed anchor。编辑等非创建表单仍把标题与生命周期动作迁进根 `FormSurface.header/actions`。
4. 历史 `FormSurface kind="modal"` 已从类型层删除；标准新建 modal 使用 `CreateSurface presentation="modal"` 并独立选择 toolbar/surface trigger，其他弹窗使用 `createPageModalSection`，modal 内容使用 typed sections。
5. 历史 `FormSurface kind="inline"` 只承载按钮：迁移到 `createActionsSection`，按钮使用 `createPageCommand` 或直接写 `BodySurfaceCommandSpec`。
6. `InputSurface` 是通用声明入口；选择区使用 `SelectorSurface`，标准创建区使用 `CreateSurface`，其他表单通过 `BodySurface` / `FormSurface` 的结构化 section 表达。

Platform Core UI direct import 按以下 recipe 清：

1. 权限矩阵这类 inline action：使用 `BodySurface` + `createActionsSection`，或在上级 table cell spec 中返回 `DataSurfaceCellSpec kind="action/actions"`。
2. `AuditLogModal`、`NotificationBell` 这类 overlay：外层 overlay 保留在实际 owner（例如 HR roster 审计或 Platform 通知）；内部筛选、表单内容使用 typed BodySurface sections，分页使用 `BodySurfaceModalSpec.pagination` 并固定渲染在 modal footer。
3. Admin tabs 的表单/表格：返回 `BodySurfaceProps` 或 typed sections 给唯一 PageSurface；不要为了系统页重新开放直接 renderer。

28 个 `AppShell` primitive 是页面壳迁移债，单独处理：

1. route/page 层保留鉴权和模块事实，生成 `PageSurface` props；不要把 AppShell 注册为 Core/Page API。
2. Platform thin adapter 只负责 `AppShell.header` 的 title/backHref/leading/actions；Core `PageSurface` 负责 tabbar/toolbar/body/footer。
3. 每个 URL 只保留一个页面级 `PageSurface`。子模块只返回 `BodySurfaceProps` 或 typed sections，不能嵌套 PageSurface，也不能通过 provider 反向注册 page chrome。

新增 Page API 时必须同步：

1. `packages/core/ui/<Name>.tsx`
2. `packages/core/ui/index.ts`
3. `packages/core/ui/registry/component-registry-data-*.ts`
4. 必要时更新 `docs/engineering/core-ui-governance.md` 或 `docs/engineering/reusable-components.md`

新增会进入 `/settings/ui` 的封装组件必须有明确 `declares`；若声明项过多或高度耦合，应拆新的 Surface。基础/私有实现不得作为业务 import。

新增或迁移 registry entry 时必须填写中文 `description`，公共声明入口补 `declares`，内部组合关系写 `composes`。`arch:surface-boundaries` 会 warning：声明项过厚或跨声明分类组合异常。结构性 UI 项进入 `gate:ui`，简单清扫项进入 `check:hygiene`；不能为了消警把 domain shared shell 注册成 Core/Page API。

`arch:surface-page-adoption` 专门防止 PageSurface 旧顶层入口回流：`blocks`、`empty`、`actions`、`tabs`、`activeTab`、`activeChild`、`onTabChange`、`onChildChange`。这些字段已经从协议删除；新增/迁移代码必须使用 `body`、`tabbar`、`toolbar` 或对应 helper。

`arch:surface-visualization-adoption` 专门扫描 `VisualizationSurface.kind="gantt"` 里的 `content` ReactNode。甘特、时间轴、组织图这类复杂可视化必须逐步升级成 typed spec 或专用 Surface；整块业务组件塞进 visualization content 只能作为短期迁移债。

`FinanceShell`、`QcModuleShell`、`AdminToolbarProvider` 这类“同一个 L2 共有的布局壳”是历史债，禁止注册为 Core/Page API。页面级 header 只能由 Platform AppShell 声明；tabbar/toolbar/body/footer 只能由 Core PageSurface 一次性声明，禁止子组件通过 provider 或 `useXxxPageToolbar` 反向注册页面 chrome。

## 6. Core Internal

Core Internal 是公开 API 的内部组合。它可以注册到关系图，但业务页不能直接 import。

例子：

- `ActionButton`
- `DropdownSurface`
- `SelectionOptionButton`
- `ToolbarOptionGroup`
- `TreeNodeCard`
- `TreeNodeBranch`
- `RemovableTag`
- `TagPill`
- `InlineCreatePanel`
- `CreatePresentationPanel`

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

- `SelectionOptionTypes.ts`
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
- 业务 UI 和 `app/(modules)` 默认只能使用公共 runtime 入口、helper 或 Surface spec；`Toolbar`、`TabBar`、`Pagination` 等 renderer 只能由 Core 内部实现使用。新增绕过由 `gate:ui` 阻断，存量迁移需要对应 Feature/Architecture 负责，不交给 Hygiene 重构。
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
/path/to/private/core-ui-change-request.md
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
kimi -p "执行 /path/to/private/kimi-core-ui-phaseX-name.md，完成后写 result。"
kimi --continue -p "读取 /path/to/private/codex-review-phaseX-name.md，只修 review 指出的问题。"
```

## 11. 审计命令

Core Internal 业务直引：

```bash
rg "ActionButton|RefreshActionButton|CreateStartButton|CreateConfirmActions|DataTableActionsCell|createDataTableEditActions|getDefaultVisibleColumns|SelectionOptionButton|ToolbarOptionGroup|SelectorCard|TreeNodeCard|TreeNodeBranch|TagPill|TagPillButton|TagRemoveButton|RemovableTag|InlineCreatePanel|CreatePresentationPanel|SplitWorkspace|ModuleCardBody" packages --glob '!packages/core/**' -n
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
