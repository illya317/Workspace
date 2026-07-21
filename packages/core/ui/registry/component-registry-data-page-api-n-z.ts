import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "Toolbar",
    description: "PageSurface 内部统一工具栏 renderer；每页最多一个桌面固定短宽度搜索且禁止页面覆盖，期间导航可在保留前后切换的同时直接选择年、季度或月，桌面和移动动作均为纯图标，新增固定为 +，移动端自动收口为搜索行、主命令坞和筛选/更多底部面板",
    declares: [
      { name: "edit-group.dirty", description: "编辑态是否存在实际修改；显式为 false 时 Core 禁用保存动作。" },
      { name: "period.nav.picker", description: "期间导航中间值可声明 year / quarter / month 选择弹层；左右按钮继续按当前粒度切换相邻期间。" },
    ],
    composes: ["ActionButton", "ActionGlyph", "SearchInput", "SearchableOptionInput", "ToolbarOptionGroup", "FieldValueFilter", "DropdownSurface", "FloatingPortalSurface"],
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
        name: "toolbar",
        description: "页面级唯一工具区：搜索、筛选、刷新、导出、新建等都进入这里。",
        children: [
          { name: "items", description: "工具项列表，具体渲染交给 Toolbar。" },
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
        description: "页脚区域；表格/数据分页统一放在 PageSurface.footer.pagination。",
        children: [
          { name: "pagination", description: "页面底部分页声明。" },
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
