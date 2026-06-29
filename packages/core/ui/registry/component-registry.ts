import type {
  CoreUiComponentCategory,
  CoreUiComponentSubcategory,
} from "./component-registry-types";

export type {
  CoreUiComponentCategory,
  CoreUiComponentRole,
  CoreUiComponentSubcategory,
  CoreUiExposure,
  CoreUiCapabilityDescriptor,
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
} from "./component-registry-types";

export {
  coreUiComponentRegistry,
  coreUiComponentRegistryRaw,
  registeredCoreUiComponentNames,
  getCoreUiCompositionGraph,
} from "./component-registry-data";

export const coreUiComponentCategoryMeta = {
  page: {
    label: "页面",
    description: "页面薄壳、页面布局、导航、toolbar、footer 和 body section 摆放。",
  },
  data: {
    label: "数据",
    description: "表格、结构化数据、记录列表、指标和数据单元格。",
  },
  form: {
    label: "表单",
    description: "表单正文、字段布局、创建流和表单输入适配。",
  },
  document: {
    label: "文档",
    description: "纸面、A4、报告和 QC 纸质模板等文档型正文。",
  },
  visualization: {
    label: "可视化",
    description: "图表、甘特、时间轴、组织图和其他复杂图形正文。",
  },
  common: {
    label: "通用",
    description: "跨页面、数据、表单、文档、可视化复用的区块、控件、动作、输入、选择、展示、浮层和基础能力。",
  },
  feedback: {
    label: "反馈",
    description: "反馈服务、反馈渲染器和历史兼容反馈入口。",
  },
} as const satisfies Record<
  CoreUiComponentCategory,
  { label: string; description: string }
>;

export const coreUiComponentSubcategoryMeta = {
  "page.surface": { label: "页面入口", description: "PageSurface 入口和页面协议的二级分类。" },
  "page.sections": { label: "页面分区", description: "PageSurface body section 树和递归分区协议。" },
  "page.frame": { label: "页面框架", description: "页面骨架、内容容器和框架渲染器。" },
  "document.surface": { label: "文档入口", description: "DocumentSurface 入口和文档正文协议。" },
  "document.paper": { label: "纸面文档", description: "纸面/A4/QC 表单和报告正文渲染器。" },
  "visualization.surface": { label: "可视化入口", description: "VisualizationSurface 入口和复杂图形正文协议。" },
  "visualization.chart": { label: "轻量图表", description: "条形图、对比图、树图等轻量可视化。" },
  "visualization.timeline": { label: "时间轴", description: "时间线、阶段线和时序型视觉组件。" },
  "visualization.gantt": { label: "甘特图", description: "甘特图、依赖线、里程碑和时间范围图。" },
  "data.surface": { label: "数据入口", description: "DataSurface 入口和数据正文协议。" },
  "data.table": { label: "数据表格", description: "表格、滚动外壳和结构化表。" },
  "data.record": { label: "数据记录", description: "记录卡、展开记录和行级阅读。" },
  "data.metric": { label: "数据指标", description: "指标卡、指标瓦片和数据摘要。" },
  "data.cell": { label: "数据单元", description: "数据单元格和数值格式化展示。" },
  "form.surface": { label: "表单入口", description: "FormSurface 入口和表单正文协议。" },
  "form.field": { label: "表单字段", description: "字段容器和字段协议。" },
  "form.layout": { label: "表单布局", description: "字段网格、分组和表单布局。" },
  "form.create": { label: "创建流程", description: "创建/内联创建/弹窗创建流程。" },
  "form.input-adapter": { label: "输入适配", description: "把 Form spec 映射到通用输入/选择的适配层。" },
  "common.chrome": { label: "通用控件栏", description: "Toolbar、TabBar、Pagination 和页面控件渲染器。" },
  "common.block": { label: "通用区块", description: "BlockSurface、Section、Panel、Message、Empty、Actions 等通用正文区块。" },
  "common.action": { label: "通用动作", description: "ActionGlyph、ActionButton 和动作排序/分组协议。" },
  "common.input": { label: "通用输入", description: "输入字段、日期、文件、文本、开关和标签输入。" },
  "common.selection": { label: "通用选择", description: "选择器、FK 搜索、字段值筛选和 selector panel。" },
  "common.display": { label: "通用展示", description: "徽标、空态、代码块和通用展示基础件。" },
  "common.overlay": { label: "通用浮层", description: "下拉、浮层、详情弹窗和浮层基础件。" },
  "common.foundation": { label: "通用基础", description: "token、样式 recipe 和基础 helper。" },
  "feedback.service": { label: "反馈服务", description: "useFeedback 等业务反馈入口。" },
  "feedback.renderer": { label: "反馈渲染", description: "Toast、ConfirmModal 和 FeedbackProvider。" },
} as const satisfies Record<
  CoreUiComponentSubcategory,
  { label: string; description: string }
>;

export function isCoreUiComponentVisibleInShowcase(
  component: { subcategory?: CoreUiComponentSubcategory },
) {
  return component.subcategory !== "common.foundation";
}
