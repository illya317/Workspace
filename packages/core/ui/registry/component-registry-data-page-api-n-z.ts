import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "Toolbar",
    description: "PageSurface 内部统一工具栏 renderer；每页最多一个桌面固定短宽度搜索且禁止页面覆盖，多组低频枚举条件可声明为 filter-panel 并在桌面折叠、移动端展开到筛选面板，期间导航可在保留前后切换的同时直接选择年、季度或月，桌面和移动动作均为纯图标，新增固定为 +",
    composes: ["ActionButton", "ActionGlyph", "SearchInput", "SearchableOptionInput", "ToolbarOptionGroup", "ToolbarFilterPanel", "FieldValueFilter", "DropdownSurface", "FloatingPortalSurface"],
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
    name: "PageContent",
    description: "页面内容容器",
  },
  {
    name: "PageSurface",
    description: "唯一页面薄壳 Surface",
    declares: [
      {
        name: "kind",
        description: "页面级语义：先声明页面 chrome 类型。",
        children: [
          { name: "login", description: "登录专属页；必须在登录路由且包含 content block + login FormSurface，使用封闭居中布局。" },
          { name: "directory", description: "L1/L2 模块目录页；自动校验当前路由深度，禁止 tabbar/toolbar/split，使用封闭目录布局。" },
          { name: "standard", description: "标准业务页；才可声明页面内 tabbar/toolbar/body/footer。" },
        ],
      },
      {
        name: "tabbar",
        description: "标准业务页内部 tab 导航；不承载 login、L1/L2、card 或 level 语义。",
        children: [
          { name: "kind", description: "固定为 tabs。" },
          { name: "items", description: "页面内 tab 项；items.children 声明选中父 Tab 后在同栏展开的 accordion 子 Tab。" },
          { name: "active", description: "当前激活项。" },
          { name: "activeChild", description: "accordion 父 Tab 当前激活的子 Tab。" },
          { name: "onChildChange", description: "accordion 子 Tab 切换回调。" },
        ],
      },
      {
        name: "create",
        description: "标准业务页唯一的页面级新建声明；PageSurface 固定派生一个 Toolbar + 并渲染对应的新建内容，业务不得在 BodySurface 递归声明 toolbar trigger。",
        children: [
          { name: "presentation", description: "页面级新建的 inline 或 block 呈现。" },
          { name: "content", description: "单 form 或多 sections 的 typed 新建内容。" },
          { name: "submission", description: "save/submit 语义与 execute，由 Core 统一反馈和关闭。" },
          { name: "state", description: "受控 open、canCreate、disabled、onOpenChange 与 onCancel。" },
        ],
      },
      {
        name: "toolbar",
        description: "页面级唯一工具区：搜索、筛选、刷新、导出等显式工具进入这里；新建 + 只能由 PageSurface.create 派生。",
        children: [
          {
            name: "items",
            description: "工具项列表，具体渲染交给 Toolbar。",
            children: [
              {
                name: "filter-panel",
                description: "多组低频枚举筛选；桌面使用纯图标入口，移动端进入统一筛选面板。",
                children: [
                  { name: "label", description: "筛选入口的无障碍名称；Toolbar 不直接显示文字。" },
                  { name: "fields", description: "字段 key、label、value、options、allLabel 与 onChange 声明。" },
                  { name: "onReset", description: "可选的一次性重置回调。" },
                ],
              },
            ],
          },
          { name: "hidden", description: "隐藏页面工具栏。" },
        ],
      },
      {
        name: "body",
        description: "正文 payload；PageSurface 只接收 BodySurface，不展开正文编排细节。",
        children: [
          { name: "kind", description: "BodySurface kind；正文 layout、section tree、split 等细节由 BodySurface 声明。" },
        ],
      },
      {
        name: "footer",
        description: "整页页脚区域；全宽分页放在 PageSurface.footer.pagination，split 主列表分页放在 master.footer.pagination。",
        children: [
          { name: "pagination", description: "页面底部全宽分页声明。" },
        ],
      },
    ],
    composes: ["DatabasePageFrame", "Toolbar", "BodySurface", "CreateSurface", "NavigationSurface", "Pagination", "ModuleCard", "EmptyStateCard"],
  },
  {
    name: "PageShell",
    description: "页面顶部骨架",
  },
  {
    name: "PageAssistantProvider",
    description: "页面助手上下文 Provider",
    capabilities: [
      { name: "openAssistant", description: "打开当前页面助手面板，并携带页面、tab 和源码定位上下文。" },
      { name: "setCurrentContext", description: "同步当前页面上下文，供 Toolbar 默认助手入口复用。" },
    ],
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
    composes: ["FloatingPortalSurface", "getFieldInputClassName"],
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
    description: "可视化正文 Surface",
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
          { name: "visual.candlestick", description: "OHLC K 线、简单移动均线与成交量；Core 统一计算布局、交互和涨跌色约定。" },
          { name: "visual.tree", description: "树形层级可视化。" },
          { name: "visual.network", description: "自动布局的有向关系图。" },
          { name: "visual.network.presentation", description: "diagram 用于结构图；map 用于力导向拓扑探索。" },
          { name: "visual.network.map", description: "大规模关系地图：Core 统一负责拓扑社区、节点碰撞、圆形外环、方向悬停、恒定字号的屏幕标签、密度避让、局部返回和最小缩放；大图只显示悬停本体标签，聚焦详情才显示出向关联标签。" },
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
    composes: ["PanelCard", "VisualizationSurfaceChart", "VisualizationNetwork", "VisualizationGantt", "VisualizationSurfaceTypes"],
  },
  {
    name: "VisualizationSurfaceChart",
    description: "VisualizationSurface 轻量图表 renderer，包含条形、对比、树形与 K 线。",
    composes: [],
  },
  {
    name: "VisualizationSurfaceTypes",
    description: "VisualizationSurface 轻量图、K 线、关系图与甘特图 public spec types。",
    composes: [],
  },
  {
    name: "VisualizationNetwork",
    description: "VisualizationSurface 有向关系图 renderer；diagram 通过 G6 Combo、汇流母线与上下分层算法展示结构，map 通过中性圆点、连接度软饱和缩放、Louvain 社区、圆形装箱与单一外围圆环探索大规模拓扑。map 的方向悬停、局部返回和最小缩放均由 Core 控制；数据导出由页面 Toolbar 统一承载。",
    composes: ["ActionGlyph"],
  },
  {
    name: "VisualizationGantt",
    description: "VisualizationSurface 甘特图 typed spec renderer；移动端提供全屏横屏专注视图并保留不支持锁屏浏览器的旋转设备回退。",
    composes: ["ActionGlyph", "VisualizationGanttUtils"],
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
    name: "SegmentedCodeInput",
    description: "分段编码输入控件",
    composes: ["TextField"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
