import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "AmountCell",
    description: "金额单元格",
    composes: ["NumberCell"],
  },
  {
    name: "BodySurface",
    description: "PageSurface 正文编排 Surface",
    declares: [
      {
        name: "kind",
        description: "正文类型：先选择正文能力或通用 section 编排容器。",
        children: [
          { name: "data", description: "数据正文，payload 为 DataSurface。" },
          { name: "form", description: "表单正文，payload 为 FormSurface。" },
          { name: "document", description: "文档正文，payload 为 DocumentSurface。" },
          { name: "visualization", description: "可视化正文，payload 为 VisualizationSurface。" },
          { name: "selector", description: "选择器正文，payload 为 SelectorSurface。" },
          { name: "navigation", description: "正文内导航，payload 为 NavigationSurface。" },
          {
            name: "section",
            description: "正文通用编排容器。",
            children: [
              { name: "sections", description: "递归 section tree。" },
              { name: "layout", description: "正文布局：stack / grid / split。" },
              { name: "gridColumns", description: "grid 布局列数：2 / 3。" },
              { name: "sectioning", description: "section 分区：none / tabs。" },
              { name: "commands", description: "正文局部命令。" },
              { name: "status", description: "正文主体状态：empty / loading / error。" },
              { name: "empty", description: "正文局部空态。" },
              { name: "modals", description: "正文局部弹窗。" },
              { name: "left/right", description: "split 布局两侧正文，均为 BodySurface payload。" },
            ],
          },
        ],
      },
      { name: "layout", description: "section 布局声明：stack / grid / split。" },
      { name: "gridColumns", description: "section grid 列数声明：2 / 3。" },
      { name: "sections", description: "section tree；每个 section 的 body 继续使用 BodySurface。" },
      { name: "sectioning", description: "tabs 等正文分区方式。" },
      { name: "commands", description: "正文内部短命令；页面级工具放 PageSurface.toolbar。" },
      { name: "split", description: "split 专属：left/right/drawerLeft/sideOpen/drawerOpen/sideLabel/splitRatio/showSideControls。" },
    ],
    composes: ["FormSurface", "DataSurface", "DocumentSurface", "NavigationSurface", "VisualizationSurface", "SelectorSurface", "Toolbar", "EmptyStateCard", "ModuleCard"],
  },
  {
    name: "DataSurface",
    description: "正文数据 Surface",
    declares: [
      {
        name: "kind",
        description: "数据视图类型：先选 table、structured、summary 或 record，再声明该分支所需字段。",
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
          {
            name: "summary",
            description: "数据摘要指标。",
            children: [
              { name: "metrics", description: "指标卡片列表。" },
            ],
          },
          {
            name: "record",
            description: "可展开记录数据。",
            children: [
              { name: "records", description: "记录列表。" },
            ],
          },
        ],
      },
      { name: "actions", description: "数据块局部动作；页面级动作放 PageSurface.toolbar。" },
    ],
    composes: ["DataTable", "TableScrollFrame", "StructuredTable", "CodeBlock", "Badge", "NumberCell", "AmountCell", "InputSurface", "SelectionGrid", "CommandButton", "EmptyStateCard", "PanelCard"],
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
