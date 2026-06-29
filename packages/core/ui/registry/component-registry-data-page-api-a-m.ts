import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const page_api_registry_entries = [
  {
    name: "AmountCell",
    description: "金额单元格",
    composes: ["NumberCell"],
  },
  {
    name: "BlockSurface",
    description: "通用正文区块 Surface",
    contract: generatedCoreUiSurfaceContracts.BlockSurface,
    declares: [
      {
        name: "kind",
        description: "区块类型。",
        children: [
          { name: "content", description: "短正文内容。" },
          { name: "message", description: "状态消息。" },
          { name: "heading", description: "正文标题。" },
          { name: "empty", description: "空态。" },
          { name: "actions", description: "动作组。" },
          { name: "group", description: "区块分组。" },
          { name: "panel", description: "面板区块。" },
          { name: "section", description: "小节区块。" },
          { name: "moduleGrid", description: "模块卡片网格。" },
        ],
      },
      { name: "content", description: "短内容或区块正文；复杂组件应拆成专用 Surface。" },
      { name: "blocks", description: "分组、panel、section 内的子区块。" },
      { name: "actions", description: "区块局部动作。" },
      { name: "presentation", description: "区块语义与展示外壳，如 tone、level、layout、bodyClassName。" },
    ],
    composes: ["PanelCard", "SectionCard", "ModuleCard", "EmptyStateCard", "CommandButton", "AnalysisBlock"],
  },
  {
    name: "BodySurface",
    description: "PageSurface 正文分类 Surface",
    contract: generatedCoreUiSurfaceContracts.BodySurface,
    composes: ["BlockSurface", "FormSurface", "DataSurface", "DocumentSurface", "NavigationRenderer", "VisualizationSurface", "MetricsSurface", "RecordSurface"],
  },
  {
    name: "DataSurface",
    description: "L1 正文数据 Surface",
    contract: generatedCoreUiSurfaceContracts.DataSurface,
    declares: [
      {
        name: "kind",
        description: "数据视图类型：先选 table 或 structured，再声明该分支所需字段。",
        children: [
          {
            name: "table",
            description: "行列数据表。",
            children: [
              { name: "rows", description: "表格数据行。" },
              { name: "columns", description: "表格列和单元格声明。" },
              { name: "rowKey", description: "行主键解析。" },
              { name: "rowActions", description: "行级动作。" },
            ],
          },
          {
            name: "structured",
            description: "结构化表格。",
            children: [
              { name: "rows", description: "结构化单元格矩阵。" },
              { name: "frame", description: "结构化表格边框。" },
              { name: "scroll", description: "结构化表格滚动区域。" },
            ],
          },
        ],
      },
      { name: "actions", description: "数据块局部动作；页面级动作放 PageSurface.toolbar。" },
    ],
    composes: ["DataTable", "TableScrollFrame", "StructuredTable", "CodeBlock", "Badge", "NumberCell", "AmountCell", "InputControl", "SelectionGrid", "CommandButton", "EmptyStateCard", "PanelCard"],
  },
  {
    name: "AnalysisBlock",
    description: "分析内容块",
    composes: ["PanelCard", "Toolbar"],
  },
  {
    name: "AutoSizeTextField",
    description: "自适应文本输入",
  },
  {
    name: "CalendarDateInput",
    description: "日期输入框",
    composes: ["FieldInputShell", "getFieldInputClassName"],
  },
  {
    name: "CheckboxChip",
    description: "复选标签",
    composes: ["CheckboxField"],
  },
  {
    name: "CheckboxField",
    description: "复选框",
  },
  {
    name: "ChoiceGroup",
    description: "纸面选择组",
  },
  {
    name: "CodeBlock",
    description: "代码块展示",
  },
  {
    name: "CommandButton",
    description: "文字命令按钮",
    composes: ["getToolbarActionClassName"],
  },
  {
    name: "ConfirmModal",
    description: "底层确认弹窗（Core 内部 / 专用弹窗使用）",
    composes: ["ActionButton", "getToolbarActionClassName"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
