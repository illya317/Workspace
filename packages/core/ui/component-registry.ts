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

export type CoreUiComponentTier = "foundation" | "primitive" | "assembly" | "shell" | "frame";

export type CoreUiComponentRegistration = {
  name: string;
  tier: CoreUiComponentTier;
  kind: CoreUiComponentKind;
  description: string;
  example: string;
  verified?: boolean;

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
  status: {
    label: "状态标识",
    description: "徽标、开关状态、层级状态和可视状态切换。",
  },
  feedback: {
    label: "反馈提示",
    description: "Toast、空状态、结果反馈和轻量状态沟通。",
  },
  form: {
    label: "表单输入",
    description: "搜索、日期、字段输入、内联创建等可编辑输入 primitive。",
  },
  picker: {
    label: "选择器",
    description: "FK 搜索、选项选择、实体选择面板和组合选择容器。",
  },
  data: {
    label: "数据视图",
    description: "表格、列控制、密集数据阅读和行级数据呈现。",
  },
  navigation: {
    label: "导航切换",
    description: "分页、Tab、步骤切换和页面内导航控制。",
  },
  overlay: {
    label: "弹层确认",
    description: "确认弹窗、详情弹层、Modal 容器和 Provider。",
  },
  toolbar: {
    label: "工具栏",
    description: "筛选栏、操作栏、分栏工具条和页面动作集合。",
  },
  layout: {
    label: "页面骨架",
    description: "页面内容区、卡片、分栏、模块入口和通用结构容器。",
  },
} as const satisfies Record<CoreUiComponentKind, { label: string; description: string }>;

export const coreUiComponentTierMeta = {
  foundation: {
    label: "风格基础",
    description: "非业务、非页面的样式配方、标记与类辅助。定义元素级视觉语言，但不一定是组件。",
  },
  primitive: {
    label: "原子组件",
    description: "最小可交互组件或稳定微展示单元，组合风格基础配方但不组合复杂业务结构。",
  },
  assembly: {
    label: "常用组合",
    description: "由原子组件组合而成的可复用模式，可能有布局观点但不含业务事实。",
  },
  shell: {
    label: "页面接口",
    description: "页面接口（Page API）层：智能体直接引用的可复用顶层容器；当前被页面框架引用而自动提升，未来可能进一步下沉或保留为智能体可见层。",
  },
  frame: {
    label: "页面框架",
    description: "页面或工作区骨架，定义内容区域之间的结构关系。",
  },
} as const satisfies Record<CoreUiComponentTier, { label: string; description: string }>;

const coreUiComponentRegistryRaw = [
  { name: "ActionButton", tier: "primitive", kind: "toolbar", description: "工具栏动作按钮", example: "Toolbar、DataTable 行动作和新建确认都传 kind=\"save\" / kind=\"cancel\" 这类 glyph 动作。", composes: ["ActionGlyph"], foundations: ["getToolbarActionClassName"] },
  { name: "ActionGlyph", tier: "primitive", kind: "toolbar", description: "通用动作图标", example: "新增 glyph 时进入 ACTION_GLYPH_KINDS 和 ACTION_GLYPH_GROUPS，并在 ACTION_GLYPH_ORDER 写入 icon / group / subgroup / order。" },
  { name: "Toolbar", tier: "assembly", kind: "toolbar", description: "统一工具栏", example: "列表页顶部统一配置搜索、状态筛选、新建按钮和分页信息。", composes: ["ActionButton", "SearchInput", "SelectField", "ToolbarOptionGroup", "FieldValueFilter"] },
  { name: "RefreshActionButton", tier: "assembly", kind: "toolbar", description: "工具栏刷新按钮", example: "Toolbar 的刷新入口统一显示刷新图标，而不是文字按钮。", composes: ["ActionButton"] },
  { name: "AmountCell", tier: "primitive", kind: "cell", description: "金额单元格", example: "在财务表格中展示 ¥ 12,800.00，并保持金额列右对齐。", composes: ["NumberCell"] },
  { name: "AnalysisBlock", tier: "assembly", kind: "layout", description: "分析内容块", example: "在人事分析页包裹趋势图、KPI 和预警摘要。", composes: ["PanelCard"] },
  { name: "AnalysisPageFrame", tier: "frame", kind: "layout", description: "分析页骨架", example: "人力分析或财务分析页面只传 tabs、metrics 和 AnalysisBlock 内容。", composes: ["PageContent", "TabBar"] },
  { name: "AutoSizeTextField", tier: "primitive", kind: "form", description: "自适应文本输入", example: "HR 批量表格中编辑手机号或身份证号时，输入框随内容宽度伸缩。" },
  { name: "BlockCreatePanel", tier: "assembly", kind: "form", description: "块状新建面板", example: "项目阶段和项目任务这类多字段新增，不常驻表单，点击标题旁 + 后展开维护。", composes: ["SectionCard", "CreateStartButton", "CreateConfirmActions"] },
  { name: "CalendarDateInput", tier: "primitive", kind: "form", description: "日期输入框", example: "在人事入职日期或合同截止日期字段中选择 2026-06-20。", foundations: ["getFieldInputClassName"] },
  { name: "CheckboxChip", tier: "primitive", kind: "form", description: "复选标签", example: "岗位说明书模板里勾选需要展示的字段。", composes: ["CheckboxField"] },
  { name: "CheckboxField", tier: "primitive", kind: "form", description: "复选框", example: "在创建表单中勾选是否启用、是否默认或是否归档。" },
  { name: "ChoiceGroup", tier: "primitive", kind: "form", description: "纸面选择组", example: "纸面记录里选择“是 / 否”，业务只传选项和值。" },

  { name: "CodeBlock", tier: "primitive", kind: "data", description: "代码块展示", example: "API 接入指南中展示 Bearer Client secret 请求头。" },
  { name: "ConfirmModal", tier: "primitive", kind: "overlay", description: "确认弹窗", example: "删除合同、归档项目或停用记录前显示确认文案和危险按钮。", composes: ["ActionButton"], foundations: ["getToolbarActionClassName"] },
  { name: "ConfirmProvider", tier: "assembly", kind: "overlay", description: "确认弹窗上下文", example: "页面调用 confirm()，由 Provider 统一渲染确认弹窗。", composes: ["ConfirmModal"] },
  { name: "useConfirm", tier: "assembly", kind: "overlay", description: "确认弹窗 Hook", example: "const confirm = useConfirm(); await confirm({ message: '...' })", composes: ["ConfirmProvider"] },
  { name: "useConfirmDelete", tier: "assembly", kind: "overlay", description: "删除确认 Hook", example: "const confirmDelete = useConfirmDelete(); await confirmDelete({ message: '...' })", composes: ["ConfirmProvider"] },
  { name: "CreateConfirmActions", tier: "assembly", kind: "form", description: "新建确认动作", example: "新建态标题旁展示取消和确认按钮，不在业务页手写 x/勾图标。", composes: ["ActionButton"] },
  { name: "CreateStartButton", tier: "assembly", kind: "form", description: "新建开始按钮", example: "列表、阶段或任务区进入新建态时，标题旁 + 高亮。", composes: ["ActionButton"] },
  { name: "DataTable", tier: "assembly", kind: "data", description: "通用数据表格", example: "渲染科目、凭证明细、合同或资料库文件列表。", composes: ["DataTableActionsCell"], foundations: ["dataTableClassNames"] },
  { name: "DataTableActionsCell", tier: "primitive", kind: "data", description: "表格操作列", example: "员工资料和批次记录表格都用查看/删除图标，不再手写操作列按钮。", composes: ["ActionButton"] },
  { name: "createDataTableEditActions", tier: "assembly", kind: "data", description: "行编辑动作工厂", example: "项目阶段、项目任务和工作项表格用同一套编辑态行级动作。", composes: ["DataTableActionsCell"] },
  { name: "getDefaultVisibleColumns", tier: "assembly", kind: "data", description: "默认可见列", example: "const visibleColumns = getDefaultVisibleColumns(columns)", composes: ["DataTable"] },
  { name: "DatabasePageFrame", tier: "frame", kind: "layout", description: "数据库页骨架", example: "员工资料、财务科目、报表配置和注册表页面只传筛选区与 DataTable。", composes: ["PageContent", "TabBar"] },
  { name: "DetailModal", tier: "primitive", kind: "overlay", description: "详情弹窗", example: "在资料库中打开文件详情或在审计页查看记录明细。" },
  { name: "DisclosureRecordCard", tier: "assembly", kind: "data", description: "可展开记录卡片", example: "审计历史里点击一条记录展开变更详情，并显示“还原到此版本”动作。" },
  { name: "DisclosureSectionHeader", tier: "primitive", kind: "navigation", description: "可折叠分组标题", example: "工作计划中切换“日常工作 / 其他工作 / 已归档”分组。" },
  { name: "DropdownSurface", tier: "primitive", kind: "overlay", description: "下拉浮层", example: "供 SelectField、DropdownMenu 等组件复用，业务不应直接使用。" },
  { name: "DropdownMenu", tier: "primitive", kind: "overlay", description: "下拉菜单", example: "平台用户菜单展示“设置 / 登出”，业务只提供动作列表。", composes: ["DropdownSurface"] },
  { name: "EmptyStateCard", tier: "assembly", kind: "layout", description: "空状态卡片", example: "筛选后无结果时显示“暂无数据，调整筛选条件”。" },
  { name: "FkFieldInput", tier: "shell", kind: "picker", description: "外键搜索输入", example: "搜索“张”后从员工候选项中选择一个负责人。", composes: ["SearchInput"] },
  { name: "FieldValueFilter", tier: "assembly", kind: "picker", description: "字段值筛选", example: "显示“员工：张文孝”，点击后先选字段，再用 HR reference-options 搜索选择员工。", composes: ["SelectField", "SearchInput", "FkFieldInput", "PickerOptionButton"] },
  { name: "ToolbarOptionGroup", tier: "primitive", kind: "toolbar", description: "工具栏选项组", example: "在筛选栏里切换“全部 / 30天 / 90天 / 已到期”或“姓名 / 全部”。" },
  { name: "useUnsavedChangesPrompt", tier: "assembly", kind: "overlay", description: "未保存离开提示", example: "详情页只传 hasUnsavedChanges，AppShell 或页内 Tab 统一确认是否离开。", composes: ["ConfirmProvider", "useConfirm"] },
  { name: "FileField", tier: "primitive", kind: "form", description: "文件选择字段", example: "在财务导入或余额核对中选择 Excel 文件，不在业务页手写原生 file input。" },
  { name: "FormField", tier: "assembly", kind: "form", description: "表单字段容器", example: "合同弹窗包裹合同名称，财务筛选条用 inline 布局包裹公司、年度等字段。" },
  { name: "FormShell", tier: "assembly", kind: "form", description: "表单外壳", example: "登录页、账号设置或导入配置表单只传字段和提交函数。" },
  { name: "getFieldInputClassName", tier: "foundation", kind: "form", description: "字段输入样式", example: "业务字段必须自渲染 input 时复用统一高度、边框和焦点态。" },
  { name: "getFieldGridCellClassName", tier: "foundation", kind: "form", description: "字段网格单元样式", example: "员工详情页的字段网格单元复用该 token，不在业务页重写格子样式。" },
  { name: "getFieldGridLabelClassName", tier: "foundation", kind: "form", description: "字段网格标签样式", example: "详情页字段标签以统一字号、字重和颜色展示。" },
  { name: "getFieldGridValueClassName", tier: "foundation", kind: "form", description: "字段网格值区样式", example: "详情页字段值和输入控件都落入同一值区样式。" },
  { name: "getFieldGroupTitleClassName", tier: "foundation", kind: "form", description: "字段分组标题样式", example: "员工资料中“身份”“联系与账号”等分组标题保持一致。" },
  { name: "getReadOnlyFieldClassName", tier: "foundation", kind: "form", description: "只读字段样式", example: "员工编码或系统计算值只读展示时保持表单视觉一致。" },
  { name: "getTagInputShellClassName", tier: "foundation", kind: "form", description: "标签输入外壳样式", example: "别名、标签或关键词输入区需要多个 chip 时复用容器样式。" },
  { name: "getTagInlineInputClassName", tier: "foundation", kind: "form", description: "标签内联输入样式", example: "员工别名标签末尾继续输入新别名时复用统一内联输入样式。" },
  { name: "getTagPillClassName", tier: "foundation", kind: "form", description: "标签项样式", example: "展示“重点客户”“GMP”这类可删除标签 chip。" },
  { name: "getToolbarActionClassName", tier: "foundation", kind: "toolbar", description: "工具栏动作样式", example: "在 Toolbar 的 custom 区域中挂一个“生成文档”主按钮，或自渲染确认弹窗底部动作。" },
  { name: "Badge", tier: "primitive", kind: "status", description: "通用徽标", example: "显示状态标签“已启用”，或层级标签“L2”。" },
  { name: "HiddenDataField", tier: "primitive", kind: "form", description: "隐藏数据字段", example: "QC 纸面日期展示为中文年月日，同时提交 ISO 日期值。" },
  { name: "InlineCreatePanel", tier: "assembly", kind: "form", description: "内联新建面板", example: "在列表顶部展开新建员工、批次、部门或岗位表单，填写 required 字段后确认创建。", composes: ["CreateConfirmActions", "FormField"] },
  { name: "ModalCreatePanel", tier: "assembly", kind: "overlay", description: "弹窗新建面板", example: "合同列表点击新建后弹出完整表单，底部使用统一取消和保存动作。", composes: ["DetailModal", "ActionButton"], foundations: ["getToolbarActionClassName"] },
  { name: "CreatePanel", tier: "assembly", kind: "form", description: "新建入口封装", example: "业务页只传 variant 和统一回调，即可在列表顶部、卡片区或弹窗中复用同一套新建逻辑。", composes: ["InlineCreatePanel", "BlockCreatePanel", "ModalCreatePanel"] },
  { name: "MetricCard", tier: "assembly", kind: "layout", description: "指标卡片", example: "分析页展示“本月 128”“同比 +12%”“预警 3”。" },
  { name: "ModuleCardBody", tier: "assembly", kind: "layout", description: "模块卡片主体", example: "设置首页或模块首页展示可进入的功能卡片。", foundations: ["moduleCardColorClasses"] },
  { name: "ModuleGridPage", tier: "frame", kind: "layout", description: "模块入口页骨架", example: "设置首页或模块首页使用卡片网格。", composes: ["PageContent"] },
  { name: "NumberCell", tier: "primitive", kind: "cell", description: "数字单元格", example: "在库存或财务表格中展示 1,280 这类数量值。" },
  { name: "OptionPicker", tier: "shell", kind: "picker", description: "统一选项选择器，支持平铺枚举、常用项 + 更多搜索，以及先选分类再选值的分组模式。", example: "从状态/角色这类少量枚举直接选择，或在职级、职称中先选序列再选具体值。", composes: ["PickerShell", "SearchInput", "PickerOptionButton"] },
  { name: "PickerOptionButton", tier: "primitive", kind: "picker", description: "选择器选项按钮", example: "职级选择器里展示 M/P/T 下面的等级按钮；分组选择器顶部用占位变体展示“未设置”。" },
  { name: "PageContent", tier: "frame", kind: "layout", description: "页面内容容器", example: "AppShell 下方包裹页面主体，统一最大宽度和上下留白。" },
  { name: "PageShell", tier: "frame", kind: "layout", description: "页面顶部骨架", example: "子页面显示返回按钮、标题、副标题和右侧主操作。" },
  { name: "Pagination", tier: "primitive", kind: "navigation", description: "分页控件", example: "数据库表格底部展示第 2/5 页和总计 48 条。" },
  { name: "PanelCard", tier: "assembly", kind: "layout", description: "通用面板卡片", example: "表单小节、详情块或数据分析块的基础容器。" },
  { name: "PickerShell", tier: "assembly", kind: "picker", description: "选择器外壳", example: "组合搜索框、候选列表和无匹配提示的选择器外壳。", composes: ["SearchInput"], foundations: ["getFieldInputClassName"] },
  { name: "TagPill", tier: "primitive", kind: "form", description: "标签内核", example: "作为 RemovableTag、TagPillButton 的共同视觉内核，也允许业务在需要时直接展示只读标签。", foundations: ["getTagPillClassName"] },
  { name: "RemovableTag", tier: "assembly", kind: "form", description: "可删除标签", example: "项目成员、岗位别名、人事标签列表都用 RemovableTag，点击 x 删除，点击标签文本不触发删除。", composes: ["TagPill", "TagRemoveButton"], foundations: ["getTagPillClassName"] },
  { name: "RatingControl", tier: "primitive", kind: "form", description: "星级评分", example: "工作计划中展示或编辑重要度、紧急度评分。" },
  { name: "SearchableOptionInput", tier: "shell", kind: "picker", description: "可搜索选项输入", example: "学校、供应商或本地白名单实体通过中文、拼音和别名搜索后选择。" },
  { name: "SearchInput", tier: "primitive", kind: "form", description: "搜索输入框", example: "输入“张”按姓名、编码、拼音搜索或筛选记录。" },
  { name: "SectionCard", tier: "assembly", kind: "layout", description: "小节卡片", example: "资料详情页展示“基础信息”“权限设置”等小节。", composes: ["PanelCard"] },
  { name: "SelectField", tier: "primitive", kind: "form", description: "下拉选择字段", example: "从“现用 / 已归档 / 全部”中选择筛选范围，或用多选切换表格列显隐。", composes: ["SearchInput", "DropdownSurface", "CheckboxField"] },
  { name: "SelectorCard", tier: "assembly", kind: "picker", description: "选择卡片", example: "左侧列表中选择一个项目或员工记录。" },
  { name: "SelectorList", tier: "shell", kind: "picker", description: "选择列表渲染器", example: "项目列表、岗位列表、权限人员网格等业务侧只传数据和选中项，不再手写 map + PanelCard。", composes: ["SelectorCard", "EmptyStateCard"] },
  { name: "SelectorTree", tier: "shell", kind: "picker", description: "树形选择渲染器", example: "目录树、部门树等业务侧只传树形数据和选中项。", composes: ["TreeNodeCard", "TreeNodeBranch"] },
  { name: "SelectorPanel", tier: "shell", kind: "picker", description: "选择器面板", example: "列表页左侧选择区：可选搜索框 + SelectorList 或 SelectorTree + EmptyStateCard。", composes: ["PanelCard", "SearchInput", "SelectorList", "SelectorTree", "EmptyStateCard"] },
  { name: "SplitWorkspace", tier: "assembly", kind: "layout", description: "左右分栏工作区", example: "左侧项目列表，右侧保持当前项目详情编辑区。", composes: ["Toolbar", "ActionButton"] },
  { name: "SwitchField", tier: "primitive", kind: "form", description: "开关字段", example: "在行内编辑中切换“启用 / 停用”或“是 / 否”。" },
  { name: "StructuredTable", tier: "assembly", kind: "data", description: "结构化表格", example: "检验记录、键值摘要或纸面格式表格只传通用行列结构，不在业务包手写 table。" },
  { name: "TabBar", tier: "primitive", kind: "navigation", description: "Tab 切换栏", example: "页面级用 variant='large' accordion 展示一级 Tab 及其子 Tab；工具栏紧凑手风琴用 variant='small' accordion；普通页内 Tab 用 variant='mid'；选择器弹层内小型分段 tabs 用 variant='micro'。" },
  { name: "TagPillButton", tier: "assembly", kind: "form", description: "可点击标签", example: "在关系表里点击一个岗位标签跳转到对应实体，同时长文本自动省略。", composes: ["TagPill"], foundations: ["getTagPillClassName"] },
  { name: "TagRemoveButton", tier: "assembly", kind: "form", description: "标签删除按钮", example: "员工别名、岗位别名或标签输入中删除某个 chip；业务只传 onConfirm 和确认文案。", composes: ["useConfirmDelete"] },
  { name: "TableScrollFrame", tier: "assembly", kind: "data", description: "表格滚动外壳", example: "宽表格在小屏幕中横向滚动，DataTable 本身只负责表格结构。", composes: ["DataTable"] },
  { name: "TemplateWorkbenchFrame", tier: "frame", kind: "layout", description: "模板工作台骨架", example: "生产检验模板页把产品、阶段、检测项和业务反馈/预览动作映射进来，特化弹窗留在业务包设计。", composes: ["Toolbar", "SearchInput", "SelectorCard", "PanelCard", "Badge", "ActionButton", "EmptyStateCard"], foundations: ["getToolbarActionClassName"] },
  { name: "TextareaField", tier: "primitive", kind: "form", description: "多行文本输入", example: "在人事备注、合同说明或资料描述中输入多行文本。" },
  { name: "TextField", tier: "primitive", kind: "form", description: "通用文本输入", example: "设置弹窗中输入用户名、密码或短文本字段。", foundations: ["getFieldInputClassName"] },
  { name: "TimeField", tier: "primitive", kind: "form", description: "时间输入框", example: "会议开始时间拆成日期字段和 09:30 时间字段，提交时组合为 2026-06-20T09:30。", foundations: ["getFieldInputClassName"] },
  { name: "Toast", tier: "primitive", kind: "feedback", description: "成功提示", example: "保存成功后显示绿色提示，失败时显示确认弹窗。", composes: ["ConfirmModal"] },
  { name: "page-style-preview", tier: "frame", kind: "layout", description: "页面样式预览", example: "设置页从 page-style-preview/template-data 获取页面模板路由和分组。" },
  { name: "TreeNodeBranch", tier: "assembly", kind: "layout", description: "树节点分支", example: "组织树中展示父部门和多个子部门节点。", composes: ["TreeNodeCard"] },
  { name: "TreeNodeCard", tier: "assembly", kind: "layout", description: "树节点卡片", example: "组织架构中展示“生产中心 / 一级部门 / 现用”。", composes: ["Badge"] },
  { name: "WorkspaceSplitPage", tier: "frame", kind: "layout", description: "主从分栏页面", example: "项目、部门岗位和资料库详情页左侧选择对象，右侧编辑详情。", composes: ["PageContent", "SplitWorkspace", "Toolbar", "ActionButton"] },
  { name: "dataTableClassNames", tier: "foundation", kind: "data", description: "表格样式配方", example: "业务自渲染表格结构时复用 DataTable 同一套样式 token。" },
  { name: "moduleCardColorClasses", tier: "foundation", kind: "layout", description: "模块卡片颜色", example: "设置首页的功能卡片按人力资源、财务等分类显示统一颜色。" },
  { name: "getModuleCardClassName", tier: "foundation", kind: "layout", description: "模块卡片样式", example: "设置首页功能卡片按人力资源、财务等分类使用统一颜色变体。", foundations: ["moduleCardColorClasses"] },
] as const satisfies readonly CoreUiComponentRegistration[];

function buildCoreUiCompositionGraph(
  registrations: readonly CoreUiComponentRegistration[],
): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const foundations = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const registration of registrations) {
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

const coreUiCompositionGraph = buildCoreUiCompositionGraph(coreUiComponentRegistryRaw);

const frameComponentNames = new Set<string>(
  coreUiComponentRegistryRaw
    .filter((component) => component.tier === "frame")
    .map((component) => component.name),
);

function deriveComponentTier(
  registration: CoreUiComponentRegistration,
): CoreUiComponentTier {
  if (registration.tier !== "primitive" && registration.tier !== "assembly") {
    return registration.tier;
  }
  const usedBy = coreUiCompositionGraph.usedBy.get(registration.name) ?? [];
  if (usedBy.some((name) => frameComponentNames.has(name))) {
    return "shell";
  }
  return registration.tier;
}

export const coreUiComponentRegistry = coreUiComponentRegistryRaw.map((component) => ({
  ...component,
  tier: deriveComponentTier(component as CoreUiComponentRegistration),
})) satisfies readonly CoreUiComponentRegistration[];

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
  return coreUiCompositionGraph;
}
