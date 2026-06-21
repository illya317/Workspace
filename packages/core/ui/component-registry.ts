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
  { name: "AccordionTabBar", kind: "navigation", description: "横版手风琴 Tab，一级 Tab 在 Toolbar 上方；选中含子项的 Tab 时横向展开子 Tab。", example: "人事页先选“员工资料”，再在同一行展开“花名册 / 字段维护 / 导入”。" },
  { name: "IconActionButton", kind: "toolbar", description: "工具栏图标动作按钮，统一隐藏列表、新建等紧凑入口的尺寸、提示和可访问名称。", example: "Toolbar 左侧用列表图标切换侧栏，用 + 进入新建流程。", includes: ["ActionButton"] },
  { name: "RefreshActionButton", kind: "toolbar", description: "工具栏刷新动作按钮，使用无边框图标样式和统一可访问名称。", example: "Toolbar 的刷新入口统一显示刷新图标，而不是文字按钮。", includes: ["IconActionButton"] },
  { name: "AmountCell", kind: "cell", description: "金额单元格，统一数值对齐、正负值和空值展示。", example: "在财务表格中展示 ¥ 12,800.00，并保持金额列右对齐。" },
  { name: "AnalysisBlock", kind: "layout", description: "分析页内容块，用于 KPI、图表或摘要区的统一分组。", example: "在人事分析页包裹趋势图、KPI 和预警摘要。" },
  { name: "AnalysisPageFrame", kind: "layout", description: "分析页骨架，统一页内 Tab、指标条和分析内容块间距。", example: "人力分析或财务分析页面只传 tabs、metrics 和 AnalysisBlock 内容。" },
  { name: "ArchiveSelectorPanel", kind: "picker", description: "实体选择面板的旧归档语义入口，后续应收敛成中性选择器。", example: "选择现用、全部或已归档实体时，业务只传入文案和数据。" },
  { name: "AutoSizeTextField", kind: "form", description: "自适应宽度文本输入 primitive，用于表格行内编辑等紧凑场景。", example: "HR 批量表格中编辑手机号或身份证号时，输入框随内容宽度伸缩。" },
  { name: "CalendarDateInput", kind: "form", description: "日期输入 primitive，替代原生 date input 并统一日期交互。", example: "在人事入职日期或合同截止日期字段中选择 2026-06-20。" },
  { name: "CheckboxChip", kind: "form", description: "复选 chip primitive，用于紧凑的多选字段开关，统一圆角、选中态和禁用态。", example: "岗位说明书模板里勾选需要展示的字段。" },
  { name: "CheckboxField", kind: "form", description: "复选框输入 primitive，统一 checked、disabled 和焦点样式。", example: "在创建表单中勾选是否启用、是否默认或是否归档。" },
  { name: "ChoiceGroup", kind: "form", description: "单选/复选组选项 primitive，统一隐藏原生输入、选中标记和候选项排列。", example: "纸面记录里选择“是 / 否”，业务只传选项和值。" },
  { name: "ColumnToggle", kind: "data", description: "表格列显隐控制，和 DataTable 共用列定义。", example: "在财务明细表里让用户切换显示字段 3/5。" },
  { name: "CodeBlock", kind: "data", description: "代码块和密钥信息展示 primitive，统一技术文本、背景和等宽字体。", example: "API 接入页展示 X-API-Key 和 X-Username 请求头。" },
  { name: "CommandToolbar", kind: "toolbar", description: "综合命令栏容器，按隐藏/显示、新建、搜索、互斥筛选、字段筛选、刷新、页面动作、编辑动作和分页信息分区；一行优先，空间不足自动换行。", example: "列表页同时承载左右分栏控制、新建入口、搜索筛选、导出、编辑保存和分页信息。", includes: ["SearchInput", "ToolbarOptionGroup", "FieldValueFilter", "IconActionButton", "RefreshActionButton", "ActionButton", "SelectField"] },
  { name: "ConfirmModal", kind: "overlay", description: "确认弹窗基础组件，统一危险操作和取消确认体验。", example: "删除合同、归档项目或停用记录前显示确认文案和危险按钮。" },
  { name: "ConfirmProvider", kind: "overlay", description: "确认弹窗上下文入口，提供命令式 confirm/delete 能力。", example: "页面调用 confirm()，由 Provider 统一渲染确认弹窗。", includes: ["ConfirmModal"] },
  { name: "DataTable", kind: "data", description: "通用数据表格 primitive，只负责列、行、空态和加载态。", example: "渲染科目、凭证明细、合同或资料库文件列表。", includes: ["dataTableClassNames", "DataTableColumn", "DataTableActionsCell"] },
  { name: "DataTableActionsCell", kind: "data", description: "表格操作列模板，统一查看、编辑、删除等行级动作图标。", example: "员工资料和批次记录表格都用查看/删除图标，不再手写操作列按钮。" },
  { name: "DataTableActionButton", kind: "data", description: "表格行级单按钮 primitive，供少量自定义操作列复用 DataTable 图标按钮规范。", example: "只有一个查看或删除入口的业务表格，直接复用 DataTableActionButton。" },
  { name: "DatabasePageFrame", kind: "layout", description: "数据库页骨架，统一 Tab、筛选工具条、摘要和表格内容排列。", example: "员工资料、财务科目、报表配置和注册表页面只传筛选区与 DataTable。" },
  { name: "DetailModal", kind: "overlay", description: "详情弹层容器，用于业务详情或编辑面板的统一包裹。", example: "在资料库中打开文件详情或在审计页查看记录明细。" },
  { name: "DisclosureRecordCard", kind: "data", description: "可展开记录卡片，统一历史、日志和明细记录的折叠头、详情区和行级动作。", example: "审计历史里点击一条记录展开变更详情，并显示“还原到此版本”动作。" },
  { name: "DisclosureSectionHeader", kind: "navigation", description: "可折叠分组标题 primitive，统一展开箭头、数量徽标和点击区域。", example: "工作清单中切换“日常工作 / 其他工作 / 已归档”分组。" },
  { name: "DropdownMenu", kind: "overlay", description: "通用下拉菜单 primitive，统一触发按钮、浮层、分隔线和危险动作样式。", example: "平台用户菜单展示“设置 / 登出”，业务只提供动作列表。" },
  { name: "EditToolbar", kind: "toolbar", description: "编辑场景工具栏，统一保存、取消和辅助动作排列。", example: "员工资料详情进入编辑态后显示“保存 / 取消 / 历史”。" },
  { name: "EmptyStateCard", kind: "layout", description: "空状态卡片，用于无数据、无匹配或待配置提示。", example: "筛选后无结果时显示“暂无数据，调整筛选条件”。" },
  { name: "FkFieldInput", kind: "picker", description: "外键实体搜索输入，只负责展示和选择；业务域传入 reference-options endpoint，Platform registry 校验 FK 契约。", example: "搜索“张”后从员工候选项中选择一个负责人。", includes: ["SearchInput"] },
  { name: "FieldValueFilter", kind: "toolbar", description: "字段和值组合筛选，工具栏只显示“字段：值”，点击后再选择字段和值；字段可声明 FK，并由业务域传入 reference-options endpoint。", example: "显示“员工：张文孝”，点击后先选字段，再用 HR reference-options 搜索选择员工。", includes: ["SelectField", "SearchInput", "FkFieldInput"] },
  { name: "FilterBar", kind: "toolbar", description: "筛选栏容器，用于承载多个筛选字段和操作区。", example: "在数据库页承载关键词、状态、部门和分页大小控件。" },
  { name: "FilterToolbar", kind: "toolbar", description: "列表筛选工具栏，统一搜索、下拉筛选和操作按钮。", example: "在项目列表顶部统一展示搜索、状态下拉和每页条数。", includes: ["SearchInput", "SelectField"] },
  { name: "ToolbarOptionGroup", kind: "toolbar", description: "工具栏参数组选项，统一“全部/状态/模式”等短参数切换，不让业务页手写一排按钮。", example: "在筛选栏里切换“全部 / 30天 / 90天 / 已到期”或“姓名 / 全部”。" },
  { name: "FileField", kind: "form", description: "文件选择输入 primitive，统一上传按钮、文件名和禁用态样式。", example: "在财务导入或余额核对中选择 Excel 文件，不在业务页手写原生 file input。" },
  { name: "FormField", kind: "form", description: "表单字段容器，统一 label、必填星号、提示和错误位置，支持表单纵向和筛选条横向布局。", example: "合同弹窗包裹合同名称，财务筛选条用 inline 布局包裹公司、年度等字段。" },
  { name: "FormShell", kind: "form", description: "语义表单外壳，统一 submit 入口，让业务和 Platform 不直接手写原生 form。", example: "登录页、账号设置或导入配置表单只传字段和提交函数。" },
  { name: "getFieldInputClassName", kind: "form", description: "字段输入框样式 token，用于少量需要业务自渲染输入的场景。", example: "业务字段必须自渲染 input 时复用统一高度、边框和焦点态。" },
  { name: "getFieldGridCellClassName", kind: "form", description: "字段网格单元样式 token，用于自渲染字段网格时保持统一边框、背景和间距。", example: "员工详情页的字段网格单元复用该 token，不在业务页重写格子样式。" },
  { name: "getFieldGridLabelClassName", kind: "form", description: "字段网格 label 样式 token，用于自渲染字段网格时统一标签列视觉。", example: "详情页字段标签以统一字号、字重和颜色展示。" },
  { name: "getFieldGridValueClassName", kind: "form", description: "字段网格值区域样式 token，用于自渲染字段网格时统一值区布局。", example: "详情页字段值和输入控件都落入同一值区样式。" },
  { name: "getFieldGroupTitleClassName", kind: "form", description: "字段分组标题样式 token，用于表单详情页的分组标题。", example: "员工资料中“身份”“联系与账号”等分组标题保持一致。" },
  { name: "getReadOnlyFieldClassName", kind: "form", description: "只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。", example: "员工编码或系统计算值只读展示时保持表单视觉一致。" },
  { name: "getTagInputShellClassName", kind: "form", description: "标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。", example: "别名、标签或关键词输入区需要多个 chip 时复用容器样式。" },
  { name: "getTagInlineInputClassName", kind: "form", description: "标签内联输入样式 token，用于 chip 输入末尾的轻量文本输入。", example: "员工别名标签末尾继续输入新别名时复用统一内联输入样式。" },
  { name: "getTagPillClassName", kind: "form", description: "标签项样式 token，统一别名、标签和可删除 chip 外观。", example: "展示“重点客户”“GMP”这类可删除标签 chip。" },
  { name: "getToolbarActionClassName", kind: "toolbar", description: "工具栏动作按钮样式 token，用于少量需要自定义按钮挂载点的场景。", example: "在 FilterToolbar 的 extraRight 中挂一个“生成文档”主按钮。" },
  { name: "GroupedOptionPicker", kind: "picker", description: "分组选项选择器，统一分组切换、清空和候选项按钮样式。", example: "专业、职称、职级这类先选分类再选具体值的字段。" },
  { name: "HierarchyBadge", kind: "status", description: "层级徽标，用于组织树、节点深度和层级状态标识。", example: "在部门树节点上显示一级、二级或三级层级标识。" },
  { name: "HiddenDataField", kind: "form", description: "隐藏数据字段 primitive，用于纸面模板或集成场景保留机器可读字段。", example: "QC 纸面日期展示为中文年月日，同时提交 ISO 日期值。" },
  { name: "InlineCreatePanel", kind: "form", description: "统一新建入口：在页面内单行展开，只放创建所需的 required/FK 字段和创建/取消动作；业务可选择输入控件，但不能自定义字段间距、改按钮文案或改成弹窗。", example: "在列表顶部展开新建员工、批次、部门或岗位表单，填写 required 字段后确认创建。" },
  { name: "MetricCard", kind: "layout", description: "指标卡片，用于展示单个统计值和标签。", example: "分析页展示“本月 128”“同比 +12%”“预警 3”。" },
  { name: "ModuleCardBody", kind: "layout", description: "模块入口卡片主体，封装图标、标题、描述、徽标和动作。", example: "设置首页或模块首页展示可进入的功能卡片。", includes: ["moduleCardColorClasses"] },
  { name: "ModuleGridPage", kind: "layout", description: "低密度模块入口页骨架，统一标题、说明和模块卡片网格。", example: "设置首页或模块首页使用卡片网格。", includes: ["PageContent"] },
  { name: "NumberCell", kind: "cell", description: "数字单元格，统一数值格式、对齐和空值展示。", example: "在库存或财务表格中展示 1,280 这类数量值。" },
  { name: "OptionPicker", kind: "picker", description: "本地选项选择器，支持搜索过滤和 PickerShell 结构。", example: "从少量本地枚举中选择部门、状态或类别。", includes: ["PickerShell", "SearchInput"] },
  { name: "PickerActionRow", kind: "picker", description: "选择器弹层内的动作行，统一清空、更换分组和辅助动作排列。", example: "专业选择器顶部显示“未设置 / 更换学科门类”。" },
  { name: "PickerOptionButton", kind: "picker", description: "选择器候选项按钮，统一选中态、普通态和紧凑尺寸。", example: "职级选择器里展示 M/P/T 下面的等级按钮。" },
  { name: "PageContent", kind: "layout", description: "页面内容宽度和内边距容器，避免业务页重复写主内容壳。", example: "AppShell 下方包裹页面主体，统一最大宽度和上下留白。" },
  { name: "PageShell", kind: "layout", description: "页面标题、返回、动作和顶部结构骨架。", example: "子页面显示返回按钮、标题、副标题和右侧主操作。" },
  { name: "PageStyleShowcase", kind: "layout", description: "页面样式预览中心，按八大业务板块展示页眉、Tab、Toolbar、主体、页脚、预览和弹出框模板。", example: "架构任务用它审阅财务、生产、人事、工作、行政、外部关系、文档中心和资料库页面样式。", includes: ["AccordionTabBar", "CommandToolbar", "DataTable", "Pagination", "SplitWorkspace", "AnalysisBlock", "StructuredTable"] },
  { name: "Pagination", kind: "navigation", description: "分页控制 primitive，统一页码、上一页下一页和数量展示。", example: "数据库表格底部展示第 2/5 页和总计 48 条。" },
  { name: "PanelCard", kind: "layout", description: "通用面板卡片，提供标题、说明、操作和内容区。", example: "表单小节、详情块或数据分析块的基础容器。" },
  { name: "PickerShell", kind: "picker", description: "选择器外壳，统一搜索、列表、空态和候选项区域。", example: "组合搜索框、候选列表和无匹配提示的选择器外壳。", includes: ["SearchInput"] },
  { name: "PickerSegmentedControl", kind: "picker", description: "选择器弹层内的分段切换器，统一组选项切换样式。", example: "职级选择器中切换 M、P、T 三个序列。" },
  { name: "RegistryBrowserCard", kind: "data", description: "注册表浏览卡片，以 3/7 分栏展示分类和注册项明细。", example: "架构任务展示 Core UI 分类、说明、示例和消费文件。" },
  { name: "RemovableTag", kind: "form", description: "可删除标签模板，统一 chip 外观、内置 x 删除入口和确认弹窗；业务不要手写 tag 内删除按钮。", example: "项目成员、岗位别名、人事标签列表都用 RemovableTag，点击 x 删除，点击标签文本不触发删除。", includes: ["TagRemoveButton"] },
  { name: "RatingControl", kind: "form", description: "星级评分 primitive，统一只读和可编辑评分按钮样式。", example: "工作清单中展示或编辑重要度、紧急度评分。" },
  { name: "SearchableOptionInput", kind: "picker", description: "可搜索选项输入，统一输入、清空、候选列表和键盘选择交互。", example: "学校、供应商或本地白名单实体通过中文、拼音和别名搜索后选择。" },
  { name: "SearchInput", kind: "form", description: "统一搜索输入，覆盖页面搜索、工具栏搜索和紧凑搜索。", example: "输入“张”按姓名、编码、拼音搜索或筛选记录。" },
  { name: "SectionCard", kind: "layout", description: "带标题的小节卡片，基于 PanelCard 收敛 section 样式。", example: "资料详情页展示“基础信息”“权限设置”等小节。", includes: ["PanelCard"] },
  { name: "SelectField", kind: "form", description: "统一下拉选择字段，支持搜索和不同密度尺寸。", example: "从“现用 / 已归档 / 全部”中选择筛选范围。", includes: ["SearchInput"] },
  { name: "SelectorCard", kind: "picker", description: "可点击选择卡片，用于实体列表、主从选择和状态标记。", example: "左侧列表中选择一个项目或员工记录。" },
  { name: "SplitWorkspace", kind: "layout", description: "左右分栏工作区，适合列表加详情的主从工作流。", example: "左侧项目列表，右侧保持当前项目详情编辑区。", includes: ["SplitWorkspaceToolbar"] },
  { name: "SplitWorkspaceToolbar", kind: "toolbar", description: "分栏工作区工具条，承接折叠、模式和辅助操作。", example: "在左右分栏顶部提供收起列表和保存详情按钮。" },
  { name: "StatusBadge", kind: "status", description: "状态徽标，统一颜色、尺寸和状态文案显示。", example: "显示“已启用”“已归档”“待审核”等状态。" },
  { name: "StatusToggle", kind: "status", description: "状态切换器，用于现用、归档、启用等离散状态切换。", example: "在列表顶部切换“现用 12 / 全部 18”。" },
  { name: "SwitchField", kind: "form", description: "开关输入 primitive，统一布尔字段的切换外观、可访问性和禁用态。", example: "在行内编辑中切换“启用 / 停用”或“是 / 否”。" },
  { name: "StructuredTable", kind: "data", description: "结构化表格 primitive，支持 colSpan、rowSpan、列宽和单元格内容插槽。", example: "检验记录、键值摘要或纸面格式表格只传通用行列结构，不在业务包手写 table。" },
  { name: "TabBar", kind: "navigation", description: "页内 Tab 切换 primitive，仅用于确实需要并列视图的场景。", example: "在模块内切换“科目设置 / 凭证明细 / 余额表”。" },
  { name: "TagRemoveButton", kind: "form", description: "标签删除按钮 primitive，统一 chip 内删除动作尺寸、hover、禁用态和删除确认弹窗。", example: "员工别名、岗位别名或标签输入中删除某个 chip；业务只传 onConfirm 和确认文案。" },
  { name: "TableScrollFrame", kind: "data", description: "表格横向滚动外壳，避免业务包重复手写 overflow-x-auto 表格容器。", example: "宽表格在小屏幕中横向滚动，DataTable 本身只负责表格结构。", includes: ["DataTable"] },
  { name: "TemplateWorkbenchFrame", kind: "layout", description: "模板结构工作台骨架，统一左侧模板选择、顶部搜索筛选、右侧阶段/项目行和行级动作承载区。", example: "生产检验模板页把产品、阶段、检测项和业务反馈/预览动作映射进来，特化弹窗留在业务包设计。", includes: ["CommandToolbar", "SearchInput", "SelectorCard", "PanelCard", "StatusBadge", "ActionButton"] },
  { name: "TextareaField", kind: "form", description: "多行文本输入 primitive，替代业务包手写 textarea。", example: "在人事备注、合同说明或资料描述中输入多行文本。" },
  { name: "TextField", kind: "form", description: "通用文本输入 primitive，替代业务包直接手写原生 input。", example: "设置弹窗中输入用户名、密码或短文本字段。" },
  { name: "Toast", kind: "feedback", description: "轻量提示组件，用于成功、失败和操作反馈。", example: "保存成功后显示绿色提示，失败时显示错误提示。" },
  { name: "Toolbar", kind: "toolbar", description: "CommandToolbar 的兼容别名导出，保留旧消费路径，新增代码优先使用 CommandToolbar。", example: "旧业务文件 import Toolbar 时仍获得统一命令栏实现。", includes: ["CommandToolbar"] },
  { name: "ToolbarShowcase", kind: "toolbar", description: "页面样式预览的兼容导出入口，真实实现已收敛到 PageStyleShowcase。", example: "旧页面继续 import ToolbarShowcase 时仍进入统一页面样式预览。", includes: ["PageStyleShowcase"] },
  { name: "page-style-preview", kind: "layout", description: "页面样式预览配置深导入命名空间，用于设置页和平台视图注册读取模板数据。", example: "设置页从 page-style-preview/template-data 获取页面模板路由和分组。" },
  { name: "TreeNodeBranch", kind: "layout", description: "树节点分支容器，统一层级缩进和连接关系。", example: "组织树中展示父部门和多个子部门节点。", includes: ["TreeNodeCard"] },
  { name: "TreeNodeCard", kind: "layout", description: "树节点卡片，统一节点标题、副标题、层级徽标和选中态。", example: "组织架构中展示“生产中心 / 一级部门 / 现用”。", includes: ["HierarchyBadge"] },
  { name: "WorkspaceSplitPage", kind: "layout", description: "主从分栏页面骨架，统一 3/7 分栏、移动端抽屉和显示隐藏工具条。", example: "项目、部门岗位和资料库详情页左侧选择对象，右侧编辑详情。", includes: ["SplitWorkspace", "SplitWorkspaceToolbar"] },
] as const satisfies readonly CoreUiComponentRegistration[];

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);
