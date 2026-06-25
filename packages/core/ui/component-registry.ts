export type CoreUiComponentKind =
  | "cell"
  | "data"
  | "feedback"
  | "form"
  | "layout"
  | "navigation"
  | "overlay"
  | "picker"
  | "status"
  | "toolbar";

export type CoreUiComponentTier = "foundation" | "primitive" | "assembly" | "frame";

export type CoreUiComponentRegistration = {
  name: string;
  tier: CoreUiComponentTier;
  kind: CoreUiComponentKind;
  description: string;
  example: string;

  // 组件或 helper 直接组合了哪些 core UI 入口。
  composes?: readonly string[];

  // 使用了哪些 foundation recipe / token / class helper。
  foundations?: readonly string[];

  // 兼容旧字段；后续可以逐步迁移为 composes。
  includes?: readonly string[];
};

export const coreUiComponentKindMeta = {
  cell: {
    label: "单元格展示",
    description: "表格或列表里的数值、金额、状态等微型展示单元。",
  },
  data: {
    label: "数据视图",
    description: "表格、列控制、密集数据阅读和行级数据呈现。",
  },
  feedback: {
    label: "反馈提示",
    description: "Toast、空状态、结果反馈和轻量状态沟通。",
  },
  form: {
    label: "表单输入",
    description: "搜索、日期、字段输入、内联创建等可编辑输入 primitive。",
  },
  layout: {
    label: "页面骨架",
    description: "页面内容区、卡片、分栏、模块入口和通用结构容器。",
  },
  navigation: {
    label: "导航切换",
    description: "分页、Tab、步骤切换和页面内导航控制。",
  },
  overlay: {
    label: "弹层确认",
    description: "确认弹窗、详情弹层、Modal 容器和 Provider。",
  },
  picker: {
    label: "选择器",
    description: "FK 搜索、选项选择、实体选择面板和组合选择容器。",
  },
  status: {
    label: "状态标识",
    description: "徽标、开关状态、层级状态和可视状态切换。",
  },
  toolbar: {
    label: "工具栏",
    description: "筛选栏、操作栏、分栏工具条和页面动作集合。",
  },
} as const satisfies Record<CoreUiComponentKind, { label: string; description: string }>;

export const coreUiComponentTierMeta = {
  foundation: {
    label: "风格基础 Foundation",
    description: "非业务、非页面的样式 recipe / token / class helper。定义元素级视觉语言，但不一定是 React 组件。",
  },
  primitive: {
    label: "原子组件 Primitive",
    description: "最小可交互组件或稳定微展示单元，组合 foundation recipe 但不组合复杂业务结构。",
  },
  assembly: {
    label: "常用组合 Assembly",
    description: "由 primitives 组合而成的可复用模式，可能有布局观点但不含业务事实。",
  },
  frame: {
    label: "页面框架 Frame",
    description: "页面或工作区骨架，定义内容区域之间的结构关系。",
  },
} as const satisfies Record<CoreUiComponentTier, { label: string; description: string }>;

export const coreUiComponentRegistry = [
  { name: "ActionButton", tier: "primitive", kind: "toolbar", description: "通用动作按钮 primitive，统一主操作、次操作和危险操作按钮。", example: "详情页中显示“保存”“取消”“删除”，业务只传动作和状态。", foundations: ["getToolbarActionClassName"] },
  { name: "ActionGlyph", tier: "primitive", kind: "toolbar", description: "通用动作图标 glyph，统一新增、归档、编辑、查看、确认、取消、删除、复制、筛选、搜索、刷新、下载、上传、显示/隐藏和更多操作的图形表达。", example: "工具栏、DataTable 行动作、新建确认和查看/隐藏切换都复用同一套图标。" },
  { name: "ActionToolbar", tier: "assembly", kind: "toolbar", description: "通用页面动作栏，承接主按钮、次按钮和左右插槽。", example: "在资料库列表顶部显示“已选择 2 条记录 / 导出 / 新增”。", composes: ["ActionButton"] },
  { name: "IconActionButton", tier: "primitive", kind: "toolbar", description: "工具栏图标动作按钮，统一隐藏列表、新建等紧凑入口的尺寸、提示和可访问名称。", example: "Toolbar 左侧用列表图标切换侧栏，用 + 进入新建流程。", composes: ["ActionButton"], foundations: ["getToolbarActionClassName"] },
  { name: "RefreshActionButton", tier: "assembly", kind: "toolbar", description: "工具栏刷新动作按钮，使用无边框图标样式和统一可访问名称。", example: "Toolbar 的刷新入口统一显示刷新图标，而不是文字按钮。", composes: ["IconActionButton", "ActionGlyph"] },
  { name: "AmountCell", tier: "primitive", kind: "cell", description: "金额单元格，统一数值对齐、正负值和空值展示。", example: "在财务表格中展示 ¥ 12,800.00，并保持金额列右对齐。", composes: ["NumberCell"] },
  { name: "AnalysisBlock", tier: "assembly", kind: "layout", description: "分析页内容块，用于 KPI、图表或摘要区的统一分组。", example: "在人事分析页包裹趋势图、KPI 和预警摘要。", composes: ["PanelCard"] },
  { name: "AnalysisPageFrame", tier: "frame", kind: "layout", description: "分析页骨架，统一页内 Tab、指标条和分析内容块间距。", example: "人力分析或财务分析页面只传 tabs、metrics 和 AnalysisBlock 内容。", composes: ["PageContent", "TabBar"] },
  { name: "EntitySelectorPanel", tier: "assembly", kind: "picker", description: "实体范围选择面板，支持 Tab 切换、搜索和单列选择；业务文案可表达为现用、全部或已归档等语义。", example: "选择现用、全部或已归档实体时，业务只传入文案和数据。", composes: ["EmptyStateCard", "PanelCard", "SearchInput"] },
  { name: "AutoSizeTextField", tier: "primitive", kind: "form", description: "自适应宽度文本输入 primitive，用于表格行内编辑等紧凑场景。", example: "HR 批量表格中编辑手机号或身份证号时，输入框随内容宽度伸缩。" },
  { name: "BlockCreatePanel", tier: "assembly", kind: "form", description: "块状新建模式，用于需要多行或多字段的新建表单；标题旁只承载 +、取消和确认动作，编辑入口应放到行级 DataTable actions。", example: "项目阶段和项目任务这类多字段新增，不常驻表单，点击标题旁 + 后展开维护。", composes: ["SectionCard", "CreateStartButton", "CreateConfirmActions"] },
  { name: "CalendarDateInput", tier: "primitive", kind: "form", description: "日期输入 primitive，替代原生 date input 并统一日期交互；时间必须使用 TimeField 单独表达。", example: "在人事入职日期或合同截止日期字段中选择 2026-06-20。", foundations: ["getFieldInputClassName"] },
  { name: "CheckboxChip", tier: "primitive", kind: "form", description: "复选 chip primitive，用于紧凑的多选字段开关，统一圆角、选中态和禁用态。", example: "岗位说明书模板里勾选需要展示的字段。", composes: ["CheckboxField"] },
  { name: "CheckboxField", tier: "primitive", kind: "form", description: "复选框输入 primitive，统一 checked、disabled 和焦点样式。", example: "在创建表单中勾选是否启用、是否默认或是否归档。" },
  { name: "ChoiceGroup", tier: "primitive", kind: "form", description: "纸面记录专用的单选/复选组选项 primitive，统一隐藏原生输入、选中标记和候选项排列；不适合普通表单场景。", example: "纸面记录里选择“是 / 否”，业务只传选项和值。" },
  { name: "ColumnToggle", tier: "primitive", kind: "data", description: "表格列显隐控制，和 DataTable 共用列定义。", example: "在财务明细表里让用户切换显示字段 3/5。", composes: ["CheckboxField"], foundations: ["getToolbarActionClassName"] },
  { name: "CodeBlock", tier: "primitive", kind: "data", description: "代码块和密钥信息展示 primitive，统一技术文本、背景和等宽字体。", example: "API 接入指南中展示 Bearer Client secret 请求头。" },
  { name: "CommandToolbar", tier: "assembly", kind: "toolbar", description: "综合命令栏容器，按隐藏/显示、新建、搜索、互斥筛选、字段筛选、刷新、页面动作、编辑动作和分页信息分区；一行优先，空间不足自动换行。", example: "列表页同时承载左右分栏控制、新建入口、搜索筛选、导出、编辑保存和分页信息。", composes: ["SearchInput", "ToolbarOptionGroup", "FieldValueFilter", "IconActionButton", "RefreshActionButton", "ActionButton", "SelectField"] },
  { name: "ConfirmModal", tier: "primitive", kind: "overlay", description: "确认弹窗基础组件，统一危险操作和取消确认体验。", example: "删除合同、归档项目或停用记录前显示确认文案和危险按钮。", composes: ["ActionButton"] },
  { name: "ConfirmProvider", tier: "assembly", kind: "overlay", description: "确认弹窗上下文入口，提供命令式 confirm/delete 能力。", example: "页面调用 confirm()，由 Provider 统一渲染确认弹窗。", composes: ["ConfirmModal"] },
  { name: "CreateConfirmActions", tier: "assembly", kind: "form", description: "新建模式的确认/取消图标动作 primitive，供 InlineCreatePanel、BlockCreatePanel 和工具条新建态共享。", example: "新建态标题旁展示取消和确认按钮，不在业务页手写 x/勾图标。", composes: ["ActionButton", "ActionGlyph"] },
  { name: "CreateStartButton", tier: "assembly", kind: "form", description: "新建模式的 + 入口 primitive，统一普通态、激活态和禁用态。", example: "列表、阶段或任务区进入新建态时，标题旁 + 高亮。", composes: ["IconActionButton", "ActionGlyph"] },
  { name: "DataTable", tier: "assembly", kind: "data", description: "通用数据表格 primitive，只负责列、行、空态和加载态。", example: "渲染科目、凭证明细、合同或资料库文件列表。", composes: ["DataTableActionsCell"], foundations: ["dataTableClassNames"] },
  { name: "DataTableActionsCell", tier: "primitive", kind: "data", description: "表格操作列模板，统一查看、编辑、删除等行级动作图标。", example: "员工资料和批次记录表格都用查看/删除图标，不再手写操作列按钮。", composes: ["ActionGlyph"] },
  { name: "createDataTableEditActions", tier: "assembly", kind: "data", description: "DataTable 行编辑动作工厂，统一详情、编辑、保存、取消和删除动作组合。", example: "项目阶段、项目任务和工作项表格用同一套编辑态行级动作。", composes: ["DataTableActionsCell"] },
  { name: "isDataTableEditDirty", tier: "assembly", kind: "data", description: "DataTable 行编辑 dirty 判断工具，和 createDataTableEditActions 配套使用。", example: "项目任务和工作项行编辑时统一判断保存按钮是否需要高亮。" },
  { name: "DatabasePageFrame", tier: "frame", kind: "layout", description: "数据库页骨架，统一 Tab、筛选工具条、摘要和表格内容排列。", example: "员工资料、财务科目、报表配置和注册表页面只传筛选区与 DataTable。", composes: ["PageContent", "TabBar"] },
  { name: "DetailModal", tier: "primitive", kind: "overlay", description: "详情弹层容器，用于业务详情或编辑面板的统一包裹。", example: "在资料库中打开文件详情或在审计页查看记录明细。" },
  { name: "DisclosureRecordCard", tier: "assembly", kind: "data", description: "可展开记录卡片，统一历史、日志和明细记录的折叠头、详情区和行级动作。", example: "审计历史里点击一条记录展开变更详情，并显示“还原到此版本”动作。" },
  { name: "DisclosureSectionHeader", tier: "primitive", kind: "navigation", description: "可折叠分组标题 primitive，统一展开箭头、数量徽标和点击区域。", example: "工作计划中切换“日常工作 / 其他工作 / 已归档”分组。" },
  { name: "DropdownMenu", tier: "primitive", kind: "overlay", description: "通用下拉菜单 primitive，统一触发按钮、浮层、分隔线和危险动作样式；内部封装 DropdownSurface 下拉浮层行为。", example: "平台用户菜单展示“设置 / 登出”，业务只提供动作列表。" },
  { name: "EditToolbar", tier: "assembly", kind: "toolbar", description: "编辑场景工具栏，统一保存、取消和辅助动作排列。", example: "员工资料详情进入编辑态后显示“保存 / 取消 / 历史”。", composes: ["ActionButton", "IconActionButton"] },
  { name: "EmptyStateCard", tier: "assembly", kind: "layout", description: "空状态卡片，用于无数据、无匹配或待配置提示。", example: "筛选后无结果时显示“暂无数据，调整筛选条件”。" },
  { name: "FkFieldInput", tier: "assembly", kind: "picker", description: "外键实体搜索输入，只负责展示和选择；业务域传入 reference-options endpoint，Platform registry 校验 FK 契约。", example: "搜索“张”后从员工候选项中选择一个负责人。", composes: ["SearchInput"] },
  { name: "FieldValueFilter", tier: "assembly", kind: "toolbar", description: "字段和值组合筛选，工具栏只显示“字段：值”，点击后再选择字段和值；字段可声明 FK，并由业务域传入 reference-options endpoint。", example: "显示“员工：张文孝”，点击后先选字段，再用 HR reference-options 搜索选择员工。", composes: ["SelectField", "SearchInput", "FkFieldInput", "PickerOptionButton"] },
  { name: "FilterBar", tier: "assembly", kind: "toolbar", description: "筛选栏容器，用于承载多个筛选字段和操作区。", example: "在数据库页承载关键词、状态、部门和分页大小控件。" },
  { name: "FilterToolbar", tier: "assembly", kind: "toolbar", description: "列表筛选工具栏，统一搜索、下拉筛选和操作按钮。", example: "在项目列表顶部统一展示搜索、状态下拉和每页条数。", composes: ["FilterBar", "SearchInput", "SelectField", "ActionButton", "ColumnToggle", "ToolbarOptionGroup"] },
  { name: "ToolbarOptionGroup", tier: "primitive", kind: "toolbar", description: "工具栏参数组选项，统一“全部/状态/模式”等短参数切换，不让业务页手写一排按钮。", example: "在筛选栏里切换“全部 / 30天 / 90天 / 已到期”或“姓名 / 全部”。" },
  { name: "useUnsavedChangesPrompt", tier: "assembly", kind: "overlay", description: "未保存离开确认 hook，统一保存按钮 dirty 状态下的离开提醒和 beforeunload 拦截。", example: "详情页只传 hasUnsavedChanges，AppShell 或页内 Tab 统一确认是否离开。", composes: ["ConfirmProvider"] },
  { name: "FileField", tier: "primitive", kind: "form", description: "文件选择输入 primitive，统一上传按钮、文件名和禁用态样式。", example: "在财务导入或余额核对中选择 Excel 文件，不在业务页手写原生 file input。" },
  { name: "FormField", tier: "assembly", kind: "form", description: "表单字段容器，统一 label、必填星号、提示和错误位置，支持表单纵向和筛选条横向布局。", example: "合同弹窗包裹合同名称，财务筛选条用 inline 布局包裹公司、年度等字段。" },
  { name: "FormShell", tier: "assembly", kind: "form", description: "语义表单外壳，统一 submit 入口，让业务和 Platform 不直接手写原生 form。", example: "登录页、账号设置或导入配置表单只传字段和提交函数。" },
  { name: "getFieldInputClassName", tier: "foundation", kind: "form", description: "字段输入框样式 token，用于少量需要业务自渲染输入的场景。", example: "业务字段必须自渲染 input 时复用统一高度、边框和焦点态。" },
  { name: "getFieldGridCellClassName", tier: "foundation", kind: "form", description: "字段网格单元样式 token，用于自渲染字段网格时保持统一边框、背景和间距。", example: "员工详情页的字段网格单元复用该 token，不在业务页重写格子样式。" },
  { name: "getFieldGridLabelClassName", tier: "foundation", kind: "form", description: "字段网格 label 样式 token，用于自渲染字段网格时统一标签列视觉。", example: "详情页字段标签以统一字号、字重和颜色展示。" },
  { name: "getFieldGridValueClassName", tier: "foundation", kind: "form", description: "字段网格值区域样式 token，用于自渲染字段网格时统一值区布局。", example: "详情页字段值和输入控件都落入同一值区样式。" },
  { name: "getFieldGroupTitleClassName", tier: "foundation", kind: "form", description: "字段分组标题样式 token，用于表单详情页的分组标题。", example: "员工资料中“身份”“联系与账号”等分组标题保持一致。" },
  { name: "getReadOnlyFieldClassName", tier: "foundation", kind: "form", description: "只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。", example: "员工编码或系统计算值只读展示时保持表单视觉一致。" },
  { name: "getTagInputShellClassName", tier: "foundation", kind: "form", description: "标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。", example: "别名、标签或关键词输入区需要多个 chip 时复用容器样式。" },
  { name: "getTagInlineInputClassName", tier: "foundation", kind: "form", description: "标签内联输入样式 token，用于 chip 输入末尾的轻量文本输入。", example: "员工别名标签末尾继续输入新别名时复用统一内联输入样式。" },
  { name: "getTagPillClassName", tier: "foundation", kind: "form", description: "标签项样式 token，统一别名、标签和可删除 chip 外观。", example: "展示“重点客户”“GMP”这类可删除标签 chip。" },
  { name: "getToolbarActionClassName", tier: "foundation", kind: "toolbar", description: "工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。", example: "在 FilterToolbar 的 extraRight 中挂一个“生成文档”主按钮。" },
  { name: "GroupedOptionPicker", tier: "assembly", kind: "picker", description: "分组选项选择器，统一分组切换、清空和候选项按钮样式。", example: "专业、职称、职级这类先选分类再选具体值的字段。", composes: ["PickerShell"] },
  { name: "Badge", tier: "primitive", kind: "status", description: "通用徽标 primitive，统一状态、层级等轻量标签展示。", example: "显示状态标签“已启用”，或层级标签“L2”。" },
  { name: "HiddenDataField", tier: "primitive", kind: "form", description: "隐藏数据字段 primitive，用于纸面模板或集成场景保留机器可读字段。", example: "QC 纸面日期展示为中文年月日，同时提交 ISO 日期值。" },
  { name: "InlineCreatePanel", tier: "assembly", kind: "form", description: "统一新建入口：在页面内单行展开，只放创建所需的 required/FK 字段和创建/取消动作；业务可选择输入控件，但不能自定义字段间距、改按钮文案或改成弹窗。", example: "在列表顶部展开新建员工、批次、部门或岗位表单，填写 required 字段后确认创建。", composes: ["CreateConfirmActions"] },
  { name: "MetricCard", tier: "assembly", kind: "layout", description: "指标卡片，用于展示单个统计值和标签。", example: "分析页展示“本月 128”“同比 +12%”“预警 3”。" },
  { name: "ModalCreatePanel", tier: "assembly", kind: "overlay", description: "弹窗新建/编辑面板，复用 DetailModal 和统一动作按钮，适合字段较多、不宜内联展开的记录维护。", example: "合同列表点击新建后弹出完整表单，底部使用统一取消和保存动作。", composes: ["DetailModal", "ActionButton"] },
  { name: "ModuleCardBody", tier: "assembly", kind: "layout", description: "模块入口卡片主体，封装图标、标题、描述、徽标和动作。", example: "设置首页或模块首页展示可进入的功能卡片。", foundations: ["moduleCardColorClasses", "getToolbarActionClassName"] },
  { name: "ModuleGridPage", tier: "frame", kind: "layout", description: "低密度模块入口页骨架，统一标题、说明和模块卡片网格。", example: "设置首页或模块首页使用卡片网格。", composes: ["PageContent"] },
  { name: "NumberCell", tier: "primitive", kind: "cell", description: "数字单元格，统一数值格式、对齐和空值展示。", example: "在库存或财务表格中展示 1,280 这类数量值。" },
  { name: "OptionPicker", tier: "assembly", kind: "picker", description: "本地选项选择器，支持搜索过滤和 PickerShell 结构。", example: "从少量本地枚举中选择部门、状态或类别。", composes: ["PickerShell", "SearchInput"] },
  { name: "PickerActionRow", tier: "assembly", kind: "picker", description: "选择器弹层内的动作行，统一清空、更换分组和辅助动作排列。", example: "专业选择器顶部显示“未设置 / 更换学科门类”。" },
  { name: "PickerOptionButton", tier: "primitive", kind: "picker", description: "选择器候选项按钮，统一选中态、普通态和紧凑尺寸。", example: "职级选择器里展示 M/P/T 下面的等级按钮。" },
  { name: "PageContent", tier: "frame", kind: "layout", description: "页面内容宽度和内边距容器，避免业务页重复写主内容壳。", example: "AppShell 下方包裹页面主体，统一最大宽度和上下留白。" },
  { name: "PageShell", tier: "frame", kind: "layout", description: "页面标题、返回、动作和顶部结构骨架。", example: "子页面显示返回按钮、标题、副标题和右侧主操作。" },
  { name: "PageStyleShowcase", tier: "frame", kind: "layout", description: "页面样式预览中心，按八大业务板块展示页眉、Tab、Toolbar、主体、页脚、预览和弹出框模板。", example: "架构任务用它审阅财务、生产、人事、工作、行政、外部关系、文档中心和资料库页面样式。", composes: ["TabBar", "CommandToolbar", "DataTable", "Pagination", "SplitWorkspace", "AnalysisBlock", "StructuredTable", "DatabasePageFrame", "PanelCard"] },
  { name: "Pagination", tier: "primitive", kind: "navigation", description: "分页控制 primitive，统一页码、上一页下一页和数量展示。", example: "数据库表格底部展示第 2/5 页和总计 48 条。" },
  { name: "PanelCard", tier: "assembly", kind: "layout", description: "通用面板卡片，提供标题、说明、操作和内容区。", example: "表单小节、详情块或数据分析块的基础容器。" },
  { name: "PickerShell", tier: "assembly", kind: "picker", description: "选择器外壳，统一搜索、列表、空态和候选项区域。", example: "组合搜索框、候选列表和无匹配提示的选择器外壳。", composes: ["SearchInput"], foundations: ["getFieldInputClassName"] },
  { name: "RegistryBrowserCard", tier: "assembly", kind: "data", description: "注册表浏览卡片，以 3/7 分栏展示分类和注册项明细。", example: "架构任务展示 Core UI 分类、说明、示例和消费文件。" },
  { name: "RemovableTag", tier: "assembly", kind: "form", description: "可删除标签模板，统一 chip 外观、内置 x 删除入口和确认弹窗；业务不要手写 tag 内删除按钮。", example: "项目成员、岗位别名、人事标签列表都用 RemovableTag，点击 x 删除，点击标签文本不触发删除。", composes: ["TagRemoveButton"], foundations: ["getTagPillClassName"] },
  { name: "RatingControl", tier: "primitive", kind: "form", description: "星级评分 primitive，统一只读和可编辑评分按钮样式。", example: "工作计划中展示或编辑重要度、紧急度评分。" },
  { name: "SearchableOptionInput", tier: "assembly", kind: "picker", description: "可搜索选项输入，统一输入、清空、候选列表和键盘选择交互。", example: "学校、供应商或本地白名单实体通过中文、拼音和别名搜索后选择。" },
  { name: "SearchInput", tier: "primitive", kind: "form", description: "统一搜索输入，覆盖页面搜索、工具栏搜索和紧凑搜索。", example: "输入“张”按姓名、编码、拼音搜索或筛选记录。" },
  { name: "SectionCard", tier: "assembly", kind: "layout", description: "带标题的小节卡片，基于 PanelCard 收敛 section 样式。", example: "资料详情页展示“基础信息”“权限设置”等小节。", composes: ["PanelCard"] },
  { name: "SelectField", tier: "primitive", kind: "form", description: "统一下拉选择字段，支持搜索和不同密度尺寸。", example: "从“现用 / 已归档 / 全部”中选择筛选范围。", composes: ["SearchInput"] },
  { name: "SelectorCard", tier: "assembly", kind: "picker", description: "可点击选择卡片，用于实体列表、主从选择和状态标记。", example: "左侧列表中选择一个项目或员工记录。" },
  { name: "SplitWorkspace", tier: "assembly", kind: "layout", description: "左右分栏工作区，适合列表加详情的主从工作流。", example: "左侧项目列表，右侧保持当前项目详情编辑区。", composes: ["SplitWorkspaceToolbar"] },
  { name: "SplitWorkspaceToolbar", tier: "assembly", kind: "toolbar", description: "分栏工作区工具条，承接折叠、模式和辅助操作。", example: "在左右分栏顶部提供收起列表和保存详情按钮。", composes: ["IconActionButton"] },
  { name: "SwitchField", tier: "primitive", kind: "form", description: "开关输入 primitive，统一布尔字段的切换外观、可访问性和禁用态。", example: "在行内编辑中切换“启用 / 停用”或“是 / 否”。" },
  { name: "StructuredTable", tier: "assembly", kind: "data", description: "结构化表格 primitive，支持 colSpan、rowSpan、列宽和单元格内容插槽。", example: "检验记录、键值摘要或纸面格式表格只传通用行列结构，不在业务包手写 table。" },
  { name: "TabBar", tier: "primitive", kind: "navigation", description: "统一 Tab 切换 primitive，支持 large / mid / small / micro 四种尺寸；large 与 small 可开启 accordion 横向展开子 Tab。", example: "页面级用 variant='large' accordion 展示一级 Tab 及其子 Tab；工具栏紧凑手风琴用 variant='small' accordion；普通页内 Tab 用 variant='mid'；选择器弹层内小型分段 tabs 用 variant='micro'。" },
  { name: "TagPillButton", tier: "assembly", kind: "form", description: "可点击标签按钮，统一 chip 外观、单行省略、hover 和焦点态。", example: "在关系表里点击一个岗位标签跳转到对应实体，同时长文本自动省略。", foundations: ["getTagPillClassName"] },
  { name: "TagRemoveButton", tier: "primitive", kind: "form", description: "标签删除按钮 primitive，统一 chip 内删除动作尺寸、hover、禁用态和删除确认弹窗。", example: "员工别名、岗位别名或标签输入中删除某个 chip；业务只传 onConfirm 和确认文案。" },
  { name: "TableScrollFrame", tier: "assembly", kind: "data", description: "表格横向滚动外壳，避免业务包重复手写 overflow-x-auto 表格容器。", example: "宽表格在小屏幕中横向滚动，DataTable 本身只负责表格结构。", composes: ["DataTable"] },
  { name: "TemplateWorkbenchFrame", tier: "frame", kind: "layout", description: "模板结构工作台骨架，统一左侧模板选择、顶部搜索筛选、右侧阶段/项目行和行级动作承载区。", example: "生产检验模板页把产品、阶段、检测项和业务反馈/预览动作映射进来，特化弹窗留在业务包设计。", composes: ["CommandToolbar", "SearchInput", "SelectorCard", "PanelCard", "Badge", "ActionButton", "EmptyStateCard"] },
  { name: "TextareaField", tier: "primitive", kind: "form", description: "多行文本输入 primitive，替代业务包手写 textarea。", example: "在人事备注、合同说明或资料描述中输入多行文本。" },
  { name: "TextField", tier: "primitive", kind: "form", description: "通用文本输入 primitive，仅用于文本、密码、邮箱、电话、URL 和数字；日期统一使用 CalendarDateInput，时间统一使用 TimeField。", example: "设置弹窗中输入用户名、密码或短文本字段。", foundations: ["getFieldInputClassName"] },
  { name: "TimeField", tier: "primitive", kind: "form", description: "时间输入 primitive，仅负责 HH:mm；需要日期时间时由业务或组合层与 CalendarDateInput 合成。", example: "会议开始时间拆成日期字段和 09:30 时间字段，提交时组合为 2026-06-20T09:30。", foundations: ["getFieldInputClassName"] },
  { name: "Toast", tier: "primitive", kind: "feedback", description: "轻量成功提示组件；错误反馈统一转为默认弹窗。", example: "保存成功后显示绿色提示，失败时显示确认弹窗。", composes: ["ConfirmModal"] },
  { name: "ToolbarSelectFilter", tier: "assembly", kind: "toolbar", description: "工具栏专用下拉筛选，统一“标签 + 当前值 + 下拉菜单”的紧凑列表筛选样式。", example: "合同台账里用“类型 全部”“状态 执行中”筛选记录，避免业务页手写下拉筛选按钮。", composes: ["SearchInput"] },
  { name: "page-style-preview", tier: "frame", kind: "layout", description: "页面样式预览配置深导入命名空间，用于设置页和平台视图注册读取模板数据。", example: "设置页从 page-style-preview/template-data 获取页面模板路由和分组。" },
  { name: "TreeNodeBranch", tier: "assembly", kind: "layout", description: "树节点分支容器，统一层级缩进和连接关系。", example: "组织树中展示父部门和多个子部门节点。", composes: ["TreeNodeCard"] },
  { name: "TreeNodeCard", tier: "assembly", kind: "layout", description: "树节点卡片，统一节点标题、副标题、层级徽标和选中态。", example: "组织架构中展示“生产中心 / 一级部门 / 现用”。", composes: ["Badge"] },
  { name: "WorkspaceSplitPage", tier: "frame", kind: "layout", description: "主从分栏页面骨架，统一 3/7 分栏、移动端抽屉和显示隐藏工具条。", example: "项目、部门岗位和资料库详情页左侧选择对象，右侧编辑详情。", composes: ["PageContent", "SplitWorkspace", "SplitWorkspaceToolbar"] },
  { name: "dataTableClassNames", tier: "foundation", kind: "data", description: "DataTable 样式 recipe，统一表头、行、单元格和空态 class 组合。", example: "业务自渲染表格结构时复用 DataTable 同一套样式 token。" },
  { name: "moduleCardColorClasses", tier: "foundation", kind: "layout", description: "模块卡片颜色 recipe，统一卡片图标背景色和悬停色。", example: "设置首页的功能卡片按人力资源、财务等分类显示统一颜色。" },
  { name: "hierarchyBadgeClassName", tier: "foundation", kind: "status", description: "层级徽标样式 recipe，统一组织树节点层级标识 class。", example: "部门树节点左侧显示一级、二级层级徽标时复用该 token。" },
  { name: "getModuleCardClassName", tier: "foundation", kind: "layout", description: "模块卡片样式 recipe，按颜色分类返回图标背景、悬停和 ring class。", example: "设置首页功能卡片按人力资源、财务等分类使用统一颜色变体。", foundations: ["moduleCardColorClasses"] },
] as const satisfies readonly CoreUiComponentRegistration[];

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);

export type CoreUiCompositionGraph = {
  composes: ReadonlyMap<string, readonly string[]>;
  foundations: ReadonlyMap<string, readonly string[]>;
  usedBy: ReadonlyMap<string, readonly string[]>;
};

/**
 * 反向计算组合关系：由 composes/foundations 推导出每个 entry 被谁使用。
 * 注意：usedBy 不要手写，必须由 registry 反向计算，否则会和 composes 漂移。
 */
export function getCoreUiCompositionGraph(): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const foundations = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const component of coreUiComponentRegistry) {
    const registration = component as CoreUiComponentRegistration;
    const compositionTargets = registration.composes ?? registration.includes ?? [];
    const foundationTargets = registration.foundations ?? [];

    composes.set(registration.name, compositionTargets);
    foundations.set(registration.name, foundationTargets);

    for (const target of compositionTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
    for (const target of foundationTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
  }

  const sortedUsedBy = new Map<string, readonly string[]>();
  for (const [name, list] of usedBy) {
    sortedUsedBy.set(name, [...new Set(list)].sort());
  }

  return { composes, foundations, usedBy: sortedUsedBy };
}
