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

export type CoreUiComponentRegistration = {
  name: string;
  kind: CoreUiComponentKind;
  description: string;
  example: string;
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

export const coreUiComponentRegistry = [
  { name: "ActionButton", kind: "toolbar", description: "通用动作按钮 primitive，统一主操作、次操作和危险操作按钮。", example: "详情页中显示“保存”“取消”“删除”，业务只传动作和状态。" },
  { name: "ActionToolbar", kind: "toolbar", description: "通用页面动作栏，承接主按钮、次按钮和左右插槽。", example: "在资料库列表顶部显示“已选择 2 条记录 / 导出 / 新增”。" },
  { name: "AmountCell", kind: "cell", description: "金额单元格，统一数值对齐、正负值和空值展示。", example: "在财务表格中展示 ¥ 12,800.00，并保持金额列右对齐。" },
  { name: "AnalysisBlock", kind: "layout", description: "分析页内容块，用于 KPI、图表或摘要区的统一分组。", example: "在人事分析页包裹趋势图、KPI 和预警摘要。" },
  { name: "ArchiveSelectorPanel", kind: "picker", description: "实体选择面板的旧归档语义入口，后续应收敛成中性选择器。", example: "选择现用、全部或已归档实体时，业务只传入文案和数据。" },
  { name: "AutoSizeTextField", kind: "form", description: "自适应宽度文本输入 primitive，用于表格行内编辑等紧凑场景。", example: "HR 批量表格中编辑手机号或身份证号时，输入框随内容宽度伸缩。" },
  { name: "CalendarDateInput", kind: "form", description: "日期输入 primitive，替代原生 date input 并统一日期交互。", example: "在人事入职日期或合同截止日期字段中选择 2026-06-20。" },
  { name: "CheckboxField", kind: "form", description: "复选框输入 primitive，统一 checked、disabled 和焦点样式。", example: "在创建表单中勾选是否启用、是否默认或是否归档。" },
  { name: "ColumnToggle", kind: "data", description: "表格列显隐控制，和 DataTable 共用列定义。", example: "在财务明细表里让用户切换显示字段 3/5。" },
  { name: "CodeBlock", kind: "data", description: "代码块和密钥信息展示 primitive，统一技术文本、背景和等宽字体。", example: "API 接入指南中展示 X-API-Key 和 X-Username 请求头。" },
  { name: "ConfirmModal", kind: "overlay", description: "确认弹窗基础组件，统一危险操作和取消确认体验。", example: "删除合同、归档计划或停用记录前显示确认文案和危险按钮。" },
  { name: "ConfirmProvider", kind: "overlay", description: "确认弹窗上下文入口，提供命令式 confirm/delete 能力。", example: "页面调用 confirm()，由 Provider 统一渲染确认弹窗。", includes: ["ConfirmModal"] },
  { name: "DataTable", kind: "data", description: "通用数据表格 primitive，只负责列、行、空态和加载态。", example: "渲染科目、凭证明细、合同或资料库文件列表。", includes: ["dataTableClassNames", "DataTableColumn"] },
  { name: "DetailModal", kind: "overlay", description: "详情弹层容器，用于业务详情或编辑面板的统一包裹。", example: "在资料库中打开文件详情或在审计页查看记录明细。" },
  { name: "DisclosureRecordCard", kind: "data", description: "可展开记录卡片，统一历史、日志和明细记录的折叠头、详情区和行级动作。", example: "审计历史里点击一条记录展开变更详情，并显示“还原到此版本”动作。" },
  { name: "DropdownMenu", kind: "overlay", description: "通用下拉菜单 primitive，统一触发按钮、浮层、分隔线和危险动作样式。", example: "平台用户菜单展示“设置 / 登出”，业务只提供动作列表。" },
  { name: "EditToolbar", kind: "toolbar", description: "编辑场景工具栏，统一保存、取消和辅助动作排列。", example: "员工资料详情进入编辑态后显示“保存 / 取消 / 历史”。" },
  { name: "EmptyStateCard", kind: "layout", description: "空状态卡片，用于无数据、无匹配或待配置提示。", example: "筛选后无结果时显示“暂无数据，调整筛选条件”。" },
  { name: "FKSearchInput", kind: "picker", description: "外键实体搜索输入，只负责展示和选择，业务 FK 契约来自 Platform。", example: "搜索“张”后从员工候选项中选择一个负责人。", includes: ["SearchInput"] },
  { name: "FilterBar", kind: "toolbar", description: "筛选栏容器，用于承载多个筛选字段和操作区。", example: "在数据库页承载关键词、状态、部门和分页大小控件。" },
  { name: "FilterField", kind: "form", description: "单个筛选字段 primitive，统一 label、字段和值区域。", example: "高级筛选中先选“状态”，再选“现用”。" },
  { name: "FilterToolbar", kind: "toolbar", description: "列表筛选工具栏，统一搜索、下拉筛选和操作按钮。", example: "在工作计划列表顶部统一展示搜索、状态下拉和每页条数。", includes: ["SearchInput", "SelectField"] },
  { name: "FileField", kind: "form", description: "文件选择输入 primitive，统一上传按钮、文件名和禁用态样式。", example: "在财务导入或余额核对中选择 Excel 文件，不在业务页手写原生 file input。" },
  { name: "getFieldInputClassName", kind: "form", description: "字段输入框样式 token，用于少量需要业务自渲染输入的场景。", example: "业务字段必须自渲染 input 时复用统一高度、边框和焦点态。" },
  { name: "getReadOnlyFieldClassName", kind: "form", description: "只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。", example: "员工编码或系统计算值只读展示时保持表单视觉一致。" },
  { name: "getTagInputShellClassName", kind: "form", description: "标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。", example: "别名、标签或关键词输入区需要多个 chip 时复用容器样式。" },
  { name: "getTagPillClassName", kind: "form", description: "标签项样式 token，统一别名、标签和可删除 chip 外观。", example: "展示“重点客户”“GMP”这类可删除标签 chip。" },
  { name: "getToolbarActionClassName", kind: "toolbar", description: "工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。", example: "在 FilterToolbar 的 extraRight 中挂一个“生成文档”主按钮。" },
  { name: "GroupedOptionPicker", kind: "picker", description: "分组选项选择器，统一分组切换、清空和候选项按钮样式。", example: "专业、职称、职级这类先选分类再选具体值的字段。" },
  { name: "HierarchyBadge", kind: "status", description: "层级徽标，用于组织树、节点深度和层级状态标识。", example: "在部门树节点上显示一级、二级或三级层级标识。" },
  { name: "InlineCreatePanel", kind: "form", description: "行内创建面板，统一快速新增的输入和确认区。", example: "在列表顶部展开快速新建表单，输入名称后确认创建。" },
  { name: "MetricCard", kind: "layout", description: "指标卡片，用于展示单个统计值和标签。", example: "分析页展示“本月 128”“同比 +12%”“预警 3”。" },
  { name: "ModuleCardBody", kind: "layout", description: "模块入口卡片主体，封装图标、标题、描述、徽标和动作。", example: "设置首页或数据治理首页展示可进入的功能卡片。", includes: ["moduleCardColorClasses"] },
  { name: "ModuleGridPage", kind: "layout", description: "低密度模块入口页骨架，统一标题、说明和模块卡片网格。", example: "设置首页、模块首页或治理入口页使用卡片网格。", includes: ["PageContent"] },
  { name: "NumberCell", kind: "cell", description: "数字单元格，统一数值格式、对齐和空值展示。", example: "在库存或财务表格中展示 1,280 这类数量值。" },
  { name: "OptionPicker", kind: "picker", description: "本地选项选择器，支持搜索过滤和 PickerShell 结构。", example: "从少量本地枚举中选择部门、状态或类别。", includes: ["PickerShell", "SearchInput"] },
  { name: "PickerActionRow", kind: "picker", description: "选择器弹层内的动作行，统一清空、更换分组和辅助动作排列。", example: "专业选择器顶部显示“未设置 / 更换学科门类”。" },
  { name: "PickerOptionButton", kind: "picker", description: "选择器候选项按钮，统一选中态、普通态和紧凑尺寸。", example: "职级选择器里展示 M/P/T 下面的等级按钮。" },
  { name: "PageContent", kind: "layout", description: "页面内容宽度和内边距容器，避免业务页重复写主内容壳。", example: "AppShell 下方包裹页面主体，统一最大宽度和上下留白。" },
  { name: "PageShell", kind: "layout", description: "页面标题、返回、动作和顶部结构骨架。", example: "子页面显示返回按钮、标题、副标题和右侧主操作。" },
  { name: "Pagination", kind: "navigation", description: "分页控制 primitive，统一页码、上一页下一页和数量展示。", example: "数据库表格底部展示第 2/5 页和总计 48 条。" },
  { name: "PanelCard", kind: "layout", description: "通用面板卡片，提供标题、说明、操作和内容区。", example: "表单小节、详情块或数据分析块的基础容器。" },
  { name: "PickerShell", kind: "picker", description: "选择器外壳，统一搜索、列表、空态和候选项区域。", example: "组合搜索框、候选列表和无匹配提示的选择器外壳。", includes: ["SearchInput"] },
  { name: "PickerSegmentedControl", kind: "picker", description: "选择器弹层内的分段切换器，统一组选项切换样式。", example: "职级选择器中切换 M、P、T 三个序列。" },
  { name: "RegistryBrowserCard", kind: "data", description: "注册表浏览卡片，以 3/7 分栏展示分类和注册项明细。", example: "数据治理页展示 Core UI 分类、说明、示例和消费文件。" },
  { name: "SearchableOptionInput", kind: "picker", description: "可搜索选项输入，统一输入、清空、候选列表和键盘选择交互。", example: "学校、供应商或本地白名单实体通过中文、拼音和别名搜索后选择。" },
  { name: "SearchInput", kind: "form", description: "统一搜索输入，覆盖页面搜索、工具栏搜索和紧凑搜索。", example: "输入“张”按姓名、编码、拼音搜索或筛选记录。" },
  { name: "SectionCard", kind: "layout", description: "带标题的小节卡片，基于 PanelCard 收敛 section 样式。", example: "资料详情页展示“基础信息”“权限设置”等小节。", includes: ["PanelCard"] },
  { name: "SelectField", kind: "form", description: "统一下拉选择字段，支持搜索和不同密度尺寸。", example: "从“现用 / 已归档 / 全部”中选择筛选范围。", includes: ["SearchInput"] },
  { name: "SelectorCard", kind: "picker", description: "可点击选择卡片，用于实体列表、主从选择和状态标记。", example: "左侧列表中选择一个工作计划或员工记录。" },
  { name: "SplitWorkspace", kind: "layout", description: "左右分栏工作区，适合列表加详情的主从工作流。", example: "左侧计划列表，右侧保持当前计划详情编辑区。", includes: ["SplitWorkspaceToolbar"] },
  { name: "SplitWorkspaceToolbar", kind: "toolbar", description: "分栏工作区工具条，承接折叠、模式和辅助操作。", example: "在左右分栏顶部提供收起列表和保存详情按钮。" },
  { name: "StatusBadge", kind: "status", description: "状态徽标，统一颜色、尺寸和状态文案显示。", example: "显示“已启用”“已归档”“待审核”等状态。" },
  { name: "StatusToggle", kind: "status", description: "状态切换器，用于现用、归档、启用等离散状态切换。", example: "在列表顶部切换“现用 12 / 全部 18”。" },
  { name: "TabBar", kind: "navigation", description: "页内 Tab 切换 primitive，仅用于确实需要并列视图的场景。", example: "在模块内切换“科目设置 / 凭证明细 / 余额表”。" },
  { name: "TextareaField", kind: "form", description: "多行文本输入 primitive，替代业务包手写 textarea。", example: "在人事备注、合同说明或资料描述中输入多行文本。" },
  { name: "TextField", kind: "form", description: "通用文本输入 primitive，替代业务包直接手写原生 input。", example: "设置弹窗中输入用户名、密码或短文本字段。" },
  { name: "Toast", kind: "feedback", description: "轻量提示组件，用于成功、失败和操作反馈。", example: "保存成功后显示绿色提示，失败时显示错误提示。" },
  { name: "TreeNodeBranch", kind: "layout", description: "树节点分支容器，统一层级缩进和连接关系。", example: "组织树中展示父部门和多个子部门节点。", includes: ["TreeNodeCard"] },
  { name: "TreeNodeCard", kind: "layout", description: "树节点卡片，统一节点标题、副标题、层级徽标和选中态。", example: "组织架构中展示“生产中心 / 一级部门 / 现用”。", includes: ["HierarchyBadge"] },
] as const satisfies readonly CoreUiComponentRegistration[];

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);
