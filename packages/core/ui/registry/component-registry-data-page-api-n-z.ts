import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const page_api_registry_entries = [
  {
    name: "RecordSurface",
    description: "L1 正文可展开记录 Surface",
    contract: generatedCoreUiSurfaceContracts.RecordSurface,
    declares: [
      { name: "records", description: "可展开记录列表。" },
      { name: "actions", description: "记录块局部动作；页面级动作放 PageSurface.toolbar。" },
    ],
    composes: ["DisclosureRecordCard", "CommandButton", "EmptyStateCard"],
  },
  {
    name: "Toolbar",
    description: "PageSurface 内部统一工具栏 renderer",
    composes: ["ActionButton", "SearchInput", "SelectField", "ToolbarOptionGroup", "FieldValueFilter", "DropdownSurface"],
  },
  {
    name: "useFeedback",
    description: "统一前端反馈 Hook",
    capabilities: [
      { name: "notify", description: "普通通知消息，Core 统一决定 toast 呈现。" },
      { name: "success", description: "成功反馈，不在业务里手写 Toast。" },
      { name: "error", description: "错误反馈，不在业务里手写错误弹层。" },
      { name: "confirm", description: "通用确认对话框。" },
      { name: "confirmDelete", description: "删除确认语义，Core 统一危险操作文案和样式。" },
    ],
    composes: ["FeedbackProvider", "ConfirmModal", "Toast"],
  },
  {
    name: "NumberCell",
    description: "数字单元格",
  },
  {
    name: "OptionPicker",
    description: "统一选项选择器，支持平铺枚举、常用项 + 更多搜索，以及先选分类再选值的分组模式。",
    composes: ["PickerShell", "SearchInput", "PickerOptionButton"],
  },
  {
    name: "PageContent",
    description: "页面内容容器",
  },
  {
    name: "PageSurface",
    description: "唯一页面薄壳 L1 Surface",
    contract: generatedCoreUiSurfaceContracts.PageSurface,
    declares: [
      {
        name: "kind",
        description: "页面级语义：先声明页面 chrome 类型。",
        children: [
          { name: "login", description: "登录专属页；必须在登录路由且包含 content block + login FormSurface，使用封闭居中布局。" },
          { name: "directory", description: "L1/L2 模块目录页；自动校验当前路由深度，禁止 navigation/toolbar/split，使用封闭目录布局。" },
          { name: "standard", description: "标准业务页；才可声明页面内 navigation/toolbar/body/footer。" },
        ],
      },
      {
        name: "navigation",
        description: "标准业务页内部 tab 导航；不承载 login、L1/L2、card 或 level 语义。",
        children: [
          { name: "kind", description: "固定为 tabs。" },
          { name: "items", description: "页面内 tab 项。" },
          { name: "active", description: "当前激活项。" },
        ],
      },
      {
        name: "toolbar",
        description: "页面级唯一工具区：搜索、筛选、刷新、导出、新建等都进入这里。",
        children: [
          { name: "items", description: "工具项列表，具体渲染交给 Toolbar。" },
          { name: "hidden", description: "隐藏页面工具栏。" },
        ],
      },
      {
        name: "body",
            description: "正文架构：先选择完整页或左右分栏，再创建 section；业务正文统一进入 BodySurface。",
        children: [
          {
            name: "kind",
            description: "正文模式：complete 表示完整正文；split 表示左侧选择区 + 右侧完整正文。",
            children: [
              {
                name: "complete",
                description: "完整正文：可声明标题、分区和 section 树。",
                children: [
                  { name: "title", description: "正文标题；页面标题不放在 FormSurface/DataSurface 内。" },
                  { name: "description", description: "正文简述。" },
                  { name: "sectioning", description: "正文 section 分区模式：none / tabs。" },
	                  {
	                    name: "sections",
	                    description: "正文 section 树；每个 section 只声明 body，由 body.kind 决定正文、导航或通用 section。",
	                    children: [
	                      { name: "key", description: "section 稳定标识；tabs 和局部状态按 key 对齐。" },
	                      { name: "label", description: "section 在 tabs/导航中的显示名。" },
	                      { name: "header", description: "section 标题、副标题、徽标和 section 级动作。" },
	                      { name: "framed", description: "section 是否有页面正文外框；默认有框。外框只由 PageSurface section 决定，正文 Surface 不再声明 framed。" },
	                      {
	                        name: "body.kind",
	                        description: "section 内容类型：先选择 BodySurface kind，再声明对应 payload。",
	                        children: [
	                          {
	                            name: "data/form/document/visualization/metrics/record",
	                            description: "页面内容 Surface；细节进入对应 payload。",
	                            children: [
	                              { name: "payload", description: "DataSurface / FormSurface / DocumentSurface / VisualizationSurface / MetricsSurface / RecordSurface payload。" },
	                            ],
	                          },
	                          {
	                            name: "section",
	                            description: "通用 section；承载 BlockSurface 或递归 section 树。",
	                            children: [
	                              { name: "surface", description: "BlockSurface payload。" },
	                              { name: "sections", description: "递归 section 树。" },
	                              { name: "layout", description: "内部 section 排布：stack / grid。" },
	                              { name: "sectioning", description: "内部 section 分区模式。" },
	                            ],
	                          },
	                          {
	                            name: "navigation",
	                            description: "导航 section。",
	                            children: [
	                              { name: "navigation", description: "使用 NavigationRenderer。" },
	                            ],
	                          },
	                        ],
	                      },
	                    ],
	                  },
                  { name: "layout", description: "正文 section 排布：single / split。" },
                  { name: "empty", description: "正文为空时的空态。" },
                  { name: "commands", description: "正文上方的简短命令；复杂工具归 toolbar。" },
                ],
              },
              {
                name: "split",
                description: "左右分栏：selector 承载选择区 Surface，right 复用 complete 正文配置。",
                children: [
                  {
                    name: "selector",
                    description: "左侧选择区；使用 SelectorSurface 声明 list/tree 细节。",
                    children: [
                      { name: "kind", description: "SelectorSurface 类型：list / tree。" },
                      { name: "items", description: "选择区数据。" },
                      { name: "selectedId", description: "当前选中 key。" },
                      { name: "renderItem", description: "声明列表卡片或树节点展示。" },
                    ],
                  },
                  { name: "drawerSelector", description: "移动端抽屉可覆盖 selector；默认复用 selector。" },
                  { name: "right", description: "右侧完整正文；使用 complete 正文配置。" },
                  { name: "sideOpen", description: "桌面左栏是否展开。" },
                  { name: "drawerOpen", description: "移动端抽屉是否展开。" },
                  { name: "sideLabel", description: "左栏控制标签。" },
                  { name: "showSideControls", description: "是否显示左栏展开/收起控制。" },
                  { name: "splitRatio", description: "左右分栏比例。" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "footer",
        description: "页脚区域；表格/数据分页统一放在 PageSurface.footer.pagination。",
        children: [
          { name: "pagination", description: "页面底部分页声明。" },
        ],
      },
      { name: "embedded", description: "嵌入式渲染，不输出完整页面框架。" },
    ],
    composes: ["DatabasePageFrame", "WorkspaceSplitPage", "Toolbar", "BodySurface", "BlockSurface", "NavigationRenderer", "SelectorSurface", "Pagination", "ModuleCard", "EmptyStateCard"],
  },
  {
    name: "PageShell",
    description: "页面顶部骨架",
  },
  {
    name: "Pagination",
    description: "分页控件",
  },
  {
    name: "PanelCard",
    description: "通用面板卡片",
  },
  {
    name: "RatingControl",
    description: "星级评分",
  },
  {
    name: "SearchableOptionInput",
    description: "可搜索选项输入",
    composes: ["getFieldInputClassName"],
  },
  {
    name: "SearchInput",
    description: "搜索输入框",
  },
  {
    name: "SectionCard",
    description: "小节卡片",
    composes: ["PanelCard"],
  },
  {
    name: "VisualizationSurface",
    description: "L1 可视化正文 Surface",
    contract: generatedCoreUiSurfaceContracts.VisualizationSurface,
    declares: [
      {
        name: "kind",
        description: "可视化类型：chart / gantt。",
        children: [
          { name: "chart", description: "轻量图表，使用 visual 声明。" },
          { name: "gantt", description: "甘特图，使用 gantt typed spec 声明。" },
        ],
      },
      {
        name: "chart",
        description: "chart 专属 payload。",
        children: [
          { name: "visual", description: "轻量图表声明。" },
          { name: "visual.barChart", description: "单序列条形图。" },
          { name: "visual.groupedBarChart", description: "分组条形图。" },
          { name: "visual.comparisonBars", description: "实际值与参考值对比。" },
          { name: "visual.tree", description: "树形层级可视化。" },
          { name: "frame", description: "chart 专属面板标题和外框声明。" },
        ],
      },
      {
        name: "gantt",
        description: "gantt 专属 payload。",
        children: [
          { name: "timeline", description: "甘特图 typed spec：rows / periodStart / zoom / dependencies / onToggle。" },
          { name: "empty", description: "甘特图空态节点。" },
          { name: "frame", description: "gantt 专属面板标题和外框声明。" },
        ],
      },
    ],
    composes: ["PanelCard", "VisualizationSurfaceChart", "VisualizationGantt", "VisualizationSurfaceTypes"],
  },
  {
    name: "VisualizationSurfaceChart",
    description: "VisualizationSurface 轻量图表 renderer。",
    composes: [],
  },
  {
    name: "VisualizationSurfaceTypes",
    description: "VisualizationSurface 轻量图与甘特图 public spec types。",
    composes: [],
  },
  {
    name: "VisualizationGantt",
    description: "VisualizationSurface 甘特图 typed spec renderer。",
    composes: ["VisualizationGanttUtils"],
  },
  {
    name: "VisualizationGanttUtils",
    description: "VisualizationSurface 甘特图时间刻度与定位算法。",
    composes: [],
  },
  {
    name: "SelectionGrid",
    description: "页面内平铺选项网格",
  },
  {
    name: "SelectField",
    description: "下拉选择字段",
    composes: ["FieldInputShell", "SearchInput", "DropdownSurface", "CheckboxField"],
  },
  {
    name: "SegmentedCodeInput",
    description: "分段编码输入控件",
    composes: ["TextField"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
