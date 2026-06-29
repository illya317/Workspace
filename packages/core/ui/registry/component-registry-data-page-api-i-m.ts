import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

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
    composes: ["InputControl"],
  },
  {
    name: "InputControl",
    description: "字段规格输入控件",
    contract: generatedCoreUiSurfaceContracts.InputControl,
    declares: [
      { name: "control", description: "输入语义：text / number / boolean / choice / reference / temporal / file / collection / rating。" },
      { name: "valueType", description: "字段数据形状：string / number / boolean / date / time / datetime / file / reference / array。" },
      { name: "options", description: "选项来源：none / static / grouped / remote；remote 用于 FK/reference。" },
      { name: "format", description: "展示和输入格式：percent / currency / date / time / datetime。" },
      { name: "mask", description: "输入约束和模板；分段编码使用 mask.kind=editableSegment。" },
    ],
    composes: ["CalendarDateInput", "CheckboxField", "ChoiceGroup", "FileField", "FkFieldInput", "OptionPicker", "PercentField", "RatingControl", "ReadOnlyField", "SearchableOptionInput", "SegmentedCodeInput", "SelectField", "SwitchField", "TagStringInput", "TextField", "TextareaField", "TimeField"],
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
    name: "createCreatePanelSection",
    description: "新建区块声明助手",
    composes: ["CreatePanel", "BlockSurface"],
  },
  {
    name: "createActionsSection",
    description: "动作区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createAnalysisSection",
    description: "分析区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createBlockSurfaceSection",
    description: "通用区块 Surface wrapper 声明助手",
    composes: ["BlockSurface"],
  },
  {
    name: "createDocumentSection",
    description: "文档 Surface block 声明助手",
    composes: ["BodySurface", "DocumentSurface"],
  },
  {
    name: "createEmptySection",
    description: "空态区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
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
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createHeadingSection",
    description: "标题区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createInlineFieldsSection",
    description: "行内字段或筛选字段 block 声明助手",
    composes: ["BodySurface", "FormSurface", "createFormSection"],
  },
  {
    name: "createMessageSection",
    description: "消息区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createMetricsSection",
    description: "指标 Surface section 声明助手",
    composes: ["BodySurface", "MetricsSurface"],
  },
  {
    name: "createModuleGridSection",
    description: "模块网格区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createPageBody",
    description: "页面正文 section 树声明助手",
    composes: ["PageSurface"],
  },
  {
    name: "createSplitPageBody",
    description: "页面左右分栏正文声明助手",
    composes: ["PageSurface", "SelectorSurface", "createPageBody"],
  },
  {
    name: "createPageDataSection",
    description: "数据 Surface block 声明助手",
    composes: ["BodySurface", "DataSurface"],
  },
  {
    name: "createPageModalSection",
    description: "页面 modal block 声明助手",
    composes: ["PageSurface"],
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
    name: "createTabbedPageBody",
    description: "页面正文 tabs sectioning 声明助手",
    composes: ["PageSurface", "createPageBody"],
  },
  {
    name: "createTabsNavigationSection",
    description: "正文 tabs 导航 block 声明助手",
    composes: ["PageSurface", "NavigationRenderer"],
  },
  {
    name: "createPageTableSection",
    description: "数据表格 section 声明助手",
    composes: ["BodySurface", "DataSurface", "createPageDataSection"],
  },
  {
    name: "createPanelSection",
    description: "面板区块声明助手",
    composes: ["BlockSurface", "createBlockSurfaceSection"],
  },
  {
    name: "createRecordSection",
    description: "记录 Surface section 声明助手",
    composes: ["BodySurface", "RecordSurface"],
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
