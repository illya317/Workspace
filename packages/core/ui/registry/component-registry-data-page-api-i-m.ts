import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "ReadOnlyField",
    description: "只读字段展示",
    composes: ["FieldInputShell", "getReadOnlyFieldClassName", "getFieldValueClassName"],
  },
  {
    name: "FieldInputShell",
    description: "字段输入外壳",
    composes: ["FieldShell", "getFieldInputClassName"],
  },
  {
    name: "FieldShell",
    description: "统一字段壳",
    composes: ["getFieldShellClassName"],
  },
  {
    name: "FieldControl",
    description: "统一字段控件选择器",
    composes: ["InputSurface"],
  },
  {
    name: "InputSurface",
    description: "字段规格输入控件",
    declares: [
      { name: "control", description: "输入语义：text / number / boolean / choice / reference / temporal / file / collection / rating。" },
      { name: "valueType", description: "字段数据形状：string / number / boolean / date / time / datetime / file / reference / array。" },
      { name: "options", description: "选项来源：none / static / grouped / remote；remote 用于 FK/reference。" },
      { name: "format", description: "展示和输入格式：percent / currency / date / time / datetime。" },
      { name: "mask", description: "输入约束和格式；可编辑片段使用 mask.kind=editableSegment。" },
    ],
    composes: ["CalendarDateInput", "CheckboxField", "ChoiceGroup", "FileField", "FkFieldInput", "OptionPicker", "PercentField", "RatingControl", "ReadOnlyField", "SearchableOptionInput", "SegmentedCodeInput", "SwitchField", "TagStringInput", "TextField", "TextareaField", "TimeField"],
  },
  {
    name: "LoginSurface",
    description: "封闭登录页 Surface",
  },
  {
    name: "PercentField",
    description: "百分比输入字段",
    composes: ["FieldInputShell", "TextField"],
  },
  {
    name: "FieldGrid",
    description: "字段网格信息表",
    composes: [
      "getFieldGridCellClassName",
      "getFieldGridMainRowClassName",
      "getFieldGridHelperRowClassName",
      "getFieldGridLabelClassName",
      "getFieldGridValueClassName",
      "getFieldGroupTitleClassName",
    ],
  },
  {
    name: "TagInlineTextField",
    description: "标签内联文本输入",
    composes: ["getTagInlineInputClassName"],
  },
  {
    name: "CreatePanel",
    description: "新建入口内部 renderer（inline | block）",
    composes: ["InlineCreatePanel", "BlockCreatePanel"],
  },
  {
    name: "createActionsSection",
    description: "动作区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createAnalysisSection",
    description: "分析区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createDocumentSection",
    description: "文档 Surface block 声明助手",
    composes: ["BodySurface", "DocumentSurface"],
  },
  {
    name: "createEmptySection",
    description: "空态区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createFieldsSection",
    description: "表单字段 block 声明助手",
    composes: ["BodySurface", "FormSurface", "createFormSection"],
  },
  {
    name: "createFormSection",
    description: "表单 Surface block 声明助手",
    composes: ["BodySurface", "FormSurface"],
  },
  {
    name: "createSectionsSection",
    description: "区块分组声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createHeadingSection",
    description: "标题区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createInlineFieldsSection",
    description: "行内字段或筛选字段 block 声明助手",
    composes: ["BodySurface", "FormSurface", "createFormSection"],
  },
  {
    name: "createListSection",
    description: "正文列表 section 声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createMessageSection",
    description: "消息区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createStatusSection",
    description: "正文状态 section 声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createMetricsSection",
    description: "数据摘要 section 声明助手",
    composes: ["BodySurface", "DataSurface", "createPageDataSection"],
  },
  {
    name: "createModuleGridSection",
    description: "模块网格区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createPageBody",
    description: "BodySurface section 树声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createBodySplitSection",
    description: "BodySurface 左右分栏 section 声明助手",
    composes: ["BodySurface", "SelectorSurface", "createPageBody"],
  },
  {
    name: "createPageDataSection",
    description: "数据 Surface block 声明助手",
    composes: ["BodySurface", "DataSurface"],
  },
  {
    name: "createPageModalSection",
    description: "正文 modal section 声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createPageSurfaceProps",
    description: "页面薄壳 props 声明助手",
    composes: ["PageSurface", "createPageBody"],
  },
  {
    name: "createPageTabsNavigation",
    description: "页面 tabs 导航声明助手",
    composes: ["PageSurface"],
  },
  {
    name: "createPageScopeNavigation",
    description: "页面空间/范围 scope 导航声明助手",
    composes: ["PageSurface", "NavigationSurface"],
  },
  {
    name: "createTabbedPageBody",
    description: "页面正文 tabs sectioning 声明助手",
    composes: ["BodySurface", "createPageBody"],
  },
  {
    name: "createPageTableSection",
    description: "数据表格 section 声明助手",
    composes: ["BodySurface", "DataSurface", "createPageDataSection"],
  },
  {
    name: "createPanelSection",
    description: "面板区块声明助手",
    composes: ["BodySurface"],
  },
  {
    name: "createRecordSection",
    description: "数据记录 section 声明助手",
    composes: ["BodySurface", "DataSurface", "createPageDataSection"],
  },
  {
    name: "createSectionSection",
    description: "章节区块声明助手",
    composes: ["createPanelSection"],
  },
  {
    name: "createVisualizationSection",
    description: "可视化 Surface block 声明助手",
    composes: ["BodySurface", "VisualizationSurface"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
