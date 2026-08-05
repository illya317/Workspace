import type { CoreUiComponentRegistration } from "./component-registry-types";

export const page_api_registry_entries = [
  {
    name: "AmountCell",
    description: "金额单元格",
    composes: ["NumberCell"],
  },
  {
    name: "BodySurface",
    description: "PageSurface 正文声明与渲染 Surface；根 section 有标题或动作时由 Core 统一派生外层 frame，公开类型由独立声明层提供",
    declares: [
      {
        name: "kind",
        description: "正文类型：先选择正文能力或通用 section 编排容器。",
        children: [
          { name: "create", description: "新建正文，payload 为 CreateSurface；trigger、presentation、anchor 与 content 分别声明。" },
          { name: "data", description: "数据正文，payload 为 DataSurface。" },
          { name: "form", description: "表单正文，payload 为 FormSurface。" },
          { name: "document", description: "文档正文，payload 为 DocumentSurface。" },
          { name: "visualization", description: "可视化正文，payload 为 VisualizationSurface。" },
          { name: "selector", description: "选择器正文，payload 为 SelectorSurface。" },
          {
            name: "section",
            description: "正文通用编排容器。",
            children: [
              { name: "sections", description: "递归 section tree。" },
              { name: "section.header.create", description: "局部 Surface +；block 由 Core 自动紧贴 header 并置于 section body 之前，row 直接触发可编辑行，调用方不声明 anchor 或图标。" },
              { name: "section.disclosure", description: "可控折叠面板：声明 expanded / onExpandedChange；同层可共享 active key 组成互斥折叠组，不等同于 TabBar accordion。" },
              { name: "layout", description: "正文布局：stack / grid / split。" },
              { name: "gridColumns", description: "grid 布局列数：2 / 3。" },
              { name: "mobilePresentation", description: "移动端 section 呈现：stack 保持连续正文；drilldown 先显示章节目录，再进入单章节并支持前后切换。" },
              { name: "commands", description: "正文局部命令。" },
              { name: "list", description: "列表正文；cards 模式只声明 title / description / badges / actions，禁止 label / meta 独立行。" },
              { name: "moduleGrid.columns", description: "模块网格可固定为 3 / 4 / 5 列；省略时沿用移动端紧凑、桌面响应式网格。" },
              { name: "status", description: "正文主体状态：empty / loading / error。" },
              { name: "message.link", description: "消息区语义链接；声明 label / href，样式由 BodySurface 决定。" },
              { name: "empty", description: "正文局部空态。" },
              { name: "modals", description: "少数阻塞式业务弹窗；必须声明 audit-history、read-only-inspection 或 workflow-action 用途，弹窗分页只能声明在 modal.pagination。" },
              { name: "master/detail", description: "split 布局只声明主列表与详情 BodySurface；master.label 统一驱动折叠按钮和移动端返回文案，master.presentation=compact 在桌面主栏压缩选择卡并保留一个辅助事实，master.footer.pagination 把主列表翻页固定在左侧栏，移动端仍展示完整列表卡片。" },
            ],
          },
        ],
      },
      { name: "layout", description: "section 布局声明：stack / grid / split。" },
      { name: "gridColumns", description: "section grid 列数声明：2 / 3。" },
      { name: "mobilePresentation", description: "section 的移动端渐进呈现：stack / drilldown。" },
      { name: "sections", description: "section tree；每个 section 的 body 继续使用 BodySurface。" },
      { name: "section.disclosure", description: "section 可控折叠面板能力；展开状态和切换回调由调用方声明，交互与外观由 Core 渲染。" },
      { name: "commands", description: "正文内部短命令；页面级工具放 PageSurface.toolbar。" },
      { name: "split", description: "split 专属：master/detail/desktop/mobile；master.presentation 可声明 default / compact，compact 把桌面选择卡收敛为身份、状态和一个辅助事实；master.footer.pagination 承载主列表分页；PageSurface 自动持有桌面折叠状态并合并唯一 toolbar 控制。" },
    ],
    composes: ["ActionGlyph", "CreateStartButton", "CreateSurface", "FormSurface", "DataSurface", "DocumentSurface", "NavigationSurface", "Pagination", "VisualizationSurface", "SelectorSurface", "EmptyStateCard", "ModuleCard"],
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
            description: "行列数据表；桌面普通表按内容和可用空间自适应列宽，矩阵保持固定列宽并支持首列锚定，移动端统一转为主次分明、可展开和可操作的记录卡片。",
            children: [
              { name: "rows", description: "表格数据行。" },
              { name: "columns", description: "表格列和单元格声明；单元格可用 meter 声明 value、max 和 label；横向展开组只声明 disclosure 的 trigger/detail、groupKey 和 expanded，Core 统一渲染视觉层级与展开边界。" },
              { name: "cellState", description: "单元格关系状态；调用方只声明 muted、info、warning、success、danger 等语义，Core 统一渲染背景和文字。" },
              { name: "cellSelected", description: "当前选择单元格；Core 使用独立中性描边，可与 info、warning、success 等关系状态叠加。" },
              { name: "scroll", description: "复杂表格的显式滚动边界；普通短字段清单默认随页面自然展开，不制造横向或纵向内滚动。只有矩阵、不可压缩列或固定视窗长表才声明滚动。" },
              { name: "disclosure", description: "可展开行的结构化标题、展开状态和层级缩进；箭头与间距由 DataSurface 统一渲染。" },
              { name: "link", description: "表格内语义链接；声明 label、href 与是否外部打开，不允许业务手写 anchor 样式。" },
              { name: "expandedRow", description: "结构化展开行；返回 DataSurface cell/data/form 声明，不接收 JSX；Core 自动高亮纵向展开触发行和详情区域。" },
              { name: "embedded", description: "单元格或展开区内嵌 data/form Surface 声明。" },
              { name: "interactive", description: "可激活单元格；声明 content、onClick、可选悬停进入/离开回调与 ariaLabel，交互壳由 DataSurface 渲染。" },
              { name: "rowKey", description: "行主键解析。" },
              { name: "rowActions", description: "行级动作。" },
            ],
          },
          {
            name: "structured",
            description: "结构化表格；简单行与带桌面列宽的简单矩阵在移动端转纵向记录卡片，只有复杂跨行跨列表格保留可横向浏览的二维结构。",
            children: [
              { name: "rows", description: "结构化单元格矩阵。" },
              { name: "action", description: "结构化单元格动作；可声明点击、禁用、语义色和悬停进入/离开回调，跨单元格业务关系仍由调用方计算。" },
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
    composes: ["Badge", "NumberCell", "AmountCell", "InputSurface", "FormSurface", "SelectionGrid", "CommandButton", "EmptyStateCard", "PanelCard"],
  },
  {
    name: "AnalysisBlock",
    description: "分析内容块",
    composes: ["PanelCard", "Toolbar"],
  },
  {
    name: "CalendarDateInput",
    description: "日期输入框",
    composes: ["FieldShell", "FloatingPortalSurface", "getFieldInputClassName"],
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
