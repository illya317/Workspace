import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "ReadOnlyField",
    description: "只读字段展示",
    composes: ["FieldShell", "getReadOnlyFieldClassName", "getFieldValueClassName"],
  },
  {
    name: "FieldShell",
    description: "统一字段壳",
    composes: ["getFieldShellClassName"],
  },
  {
    name: "InputSurface",
    description: "字段规格输入控件",
    declares: [
      { name: "control", description: "输入语义：text / number / boolean / choice / reference / temporal / file / collection / rating。" },
      { name: "valueType", description: "字段数据形状：string / number / boolean / date / time / datetime / file / reference / array。" },
      { name: "options", description: "选项来源：none / static / grouped / remote；remote 用于 FK/reference。" },
      { name: "presentation", description: "布尔呈现只允许 checkbox / choice；业务状态值使用带产品文案的 choice 下拉，checkbox 仅用于明确勾选语义。" },
      { name: "format", description: "展示和输入格式：percent / currency / date / time / datetime。" },
      { name: "mask", description: "输入约束和格式；可编辑片段使用 mask.kind=editableSegment。" },
      { name: "state", description: "normal / readonly / disabled / required / hidden；顶层 disabled/readOnly 与 spec.state 合并后统一约束真实控件。" },
      { name: "validation", description: "必填、数值范围、日期上下限和格式校验；日期使用 minDate / maxDate。" },
      { name: "autoGrow", description: "多行文本随内容和可用宽度自动增高，避免字段内部滚动。" },
    ],
    composes: ["CalendarDateInput", "CheckboxField", "ChoiceGroup", "FileField", "FkFieldInput", "PercentField", "RatingControl", "ReadOnlyField", "SearchableOptionInput", "SegmentedCodeInput", "TagStringInput", "TextField", "TextareaField", "TimeField"],
  },
  {
    name: "PaperInputSurface",
    description: "纸面文档中的行内填写 Surface；独立于普通表单 InputSurface",
    declares: [
      { name: "kind", description: "纸面输入类型：line / date / select / choice。" },
      { name: "layout", description: "纸面字段宽度、对齐、下划线、数值精度和推荐范围。" },
      { name: "placement", description: "纸面行内或表格单元格语义。" },
      { name: "state", description: "值、只读状态和变更事件。" },
    ],
    composes: ["PaperChoiceInput", "PaperDateInput", "PaperLineInput", "PaperSelectInput"],
  },
  {
    name: "PercentField",
    description: "百分比输入字段",
    composes: ["FieldShell", "TextField"],
  },
  {
    name: "FieldGrid",
    description: "字段网格信息表；section 统一选择 inline 或 stack，Core 统一计算标签轨道、输入轨道、溢出提示和标签区高度",
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
    name: "CreateSurface",
    description: "统一新建 Surface；按钮、动作位置、样式和顺序由 Core 固定",
    declares: [
      {
        name: "trigger",
        description: "只选择新建 + 的位置：Page Toolbar 或所属 Surface。",
        children: [
          { name: "toolbar", description: "+ 由 PageSurface 派生到唯一 Page Toolbar。" },
          { name: "surface", description: "+ 跟随所属 section 或 DataSurface cell；section header 的 block 内容由 BodySurface 自动放在 header 后、body 前。" },
        ],
      },
      { name: "presentation", description: "选择 inline、block 或 modal；只改变呈现容器，不改变非 inline 表单格式。inline 固定为 Page toolbar + 单 form + 无 anchor。" },
      { name: "anchor", description: "普通 block 可选的跨区内容 target；BodySurface section header create 不接受 anchor，由 Core 自动就地放置。" },
      { name: "content", description: "选择单个 typed form（可带 two-stage flow），或 CreateSurface 自有的多 section；所有非 inline 组合复用同一个 FormSurface grid renderer。" },
      { name: "submission", description: "只声明 save 或 submit 语义与 execute；流程页面由 Platform ActionRuntime 适配，Core 固定按钮呈现。" },
      { name: "feedback", description: "保存、提交流程和失败反馈由 Core Toast 统一呈现。" },
      { name: "state", description: "受控 open、canCreate、disabled、onOpenChange 与 onCancel；submitting 由 Core 内部管理。" },
    ],
    composes: ["InlineCreatePanel", "CreatePresentationPanel", "FormSurface", "useFeedback"],
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
    name: "createMasterDetailBody",
    description: "BodySurface 主列表与详情工作区声明助手；master.footer.pagination 可将主列表翻页留在侧栏，折叠和移动端推进由 Core 持有",
    composes: ["BodySurface", "SelectorSurface", "Pagination"],
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
    name: "createPageTabBar",
    description: "页面 tabs 导航声明助手；items.children + activeChild / onChildChange 声明 accordion 子 Tab",
    composes: ["PageSurface"],
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
