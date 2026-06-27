import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentOwnerL1,
  CoreUiComponentOwnerL2,
  CoreUiComponentPublicUse,
  CoreUiComponentRole,
  CoreUiComponentRefLevel,
  CoreUiComponentUiLevel,
} from "./component-registry-types";

export type {
  CoreUiComponentKind,
  CoreUiComponentAccessLayer,
  CoreUiFrameMaturity,
  CoreUiComponentUiLevel,
  CoreUiComponentRefLevel,
  CoreUiComponentOwnerL1,
  CoreUiComponentOwnerL2,
  CoreUiComponentRole,
  CoreUiComponentPublicUse,
  CoreUiAgentExposure,
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
} from "./component-registry-types";

export {
  coreUiComponentRegistry,
  coreUiComponentRegistryRaw,
  registeredCoreUiComponentNames,
  getCoreUiCompositionGraph,
} from "./component-registry-data";

export const coreUiComponentKindMeta = {
  cell: {
    label: "单元格展示",
    description: "表格或列表里的数值、金额、状态等微型展示单元。",
  },
  status: {
    label: "状态标识",
    description: "徽标、开关状态、层级状态和可视状态切换。",
  },
  feedback: {
    label: "反馈提示",
    description: "Toast、空状态、结果反馈和轻量状态沟通。",
  },
  form: {
    label: "表单输入",
    description: "搜索、日期、字段输入、内联创建等可编辑输入 primitive。",
  },
  picker: {
    label: "选择器",
    description: "FK 搜索、选项选择、实体选择面板和组合选择容器。",
  },
  data: {
    label: "数据视图",
    description: "表格、列控制、密集数据阅读和行级数据呈现。",
  },
  navigation: {
    label: "导航切换",
    description: "分页、Tab、步骤切换和页面内导航控制。",
  },
  overlay: {
    label: "弹层确认",
    description: "确认弹窗、详情弹层、Modal 容器和 Provider。",
  },
  toolbar: {
    label: "工具栏",
    description: "筛选栏、操作栏、分栏工具条和页面动作集合。",
  },
  layout: {
    label: "页面骨架",
    description: "页面内容区、卡片、分栏、模块入口和通用结构容器。",
  },
} as const satisfies Record<
  import("./component-registry-types").CoreUiComponentKind,
  { label: string; description: string }
>;

export const coreUiComponentAccessLayerMeta = {
  "page-frame": {
    label: "页面框架",
    description: "页面骨架。只管理页面结构，不包含业务事实。",
    agentSelectable: false,
  },
  "page-api": {
    label: "页面 API",
    description: "业务页 / agent 可以直接使用的公开 UI 接口。",
    agentSelectable: true,
  },
  "core-internal": {
    label: "核心内部",
    description: "只服务 Page API 的内部组合。关系图可见，但不作为 agent 可选组件。",
    agentSelectable: false,
  },
  foundation: {
    label: "基础层",
    description: "样式配方、token、glyph taxonomy、className recipe。伪注册为材料/依赖。",
    agentSelectable: false,
  },
  "private-impl": {
    label: "Private Impl",
    description: "公开 UI 的私有实现文件。不注册、不展示为独立 UI。",
    agentSelectable: false,
  },
} as const satisfies Record<
  import("./component-registry-types").CoreUiComponentAccessLayer,
  { label: string; description: string; agentSelectable: boolean }
>;

export const coreUiComponentOwnerL1Meta = {
  page: {
    label: "页面",
    description: "页面骨架和页面内正文渲染器的归属。",
  },
  data: {
    label: "数据",
    description: "数据视图、表格、记录、指标、图表和数据单元格。",
  },
  form: {
    label: "表单",
    description: "表单正文、字段布局、创建流和表单输入适配。",
  },
  common: {
    label: "通用",
    description: "跨页面、数据、表单、反馈复用的控件、动作、输入、选择、展示、浮层和基础能力。",
  },
  feedback: {
    label: "反馈",
    description: "反馈服务、反馈渲染器和历史兼容反馈入口。",
  },
} as const satisfies Record<
  CoreUiComponentOwnerL1,
  { label: string; description: string }
>;

export const coreUiComponentOwnerL2Meta = {
  "page.surface": { label: "页面入口", description: "PageSurface 入口和页面协议。" },
  "page.blocks": { label: "页面区块", description: "PageSurface body 可组合的页面内容块。" },
  "page.frame": { label: "页面框架", description: "页面骨架、内容容器和框架渲染器。" },
  "page.document": { label: "纸面文档", description: "纸面/A4/报告正文渲染器。" },
  "data.surface": { label: "数据入口", description: "DataSurface 入口和数据正文协议。" },
  "data.table": { label: "数据表格", description: "表格、滚动外壳和结构化表。" },
  "data.record": { label: "数据记录", description: "记录卡、展开记录和行级阅读。" },
  "data.metric": { label: "数据指标", description: "指标卡、指标瓦片和数据摘要。" },
  "data.visual": { label: "数据可视化", description: "图表/可视化数据渲染器。" },
  "data.cell": { label: "数据单元", description: "数据单元格和数值格式化展示。" },
  "form.surface": { label: "表单入口", description: "FormSurface 入口和表单正文协议。" },
  "form.field": { label: "表单字段", description: "字段容器和字段协议。" },
  "form.layout": { label: "表单布局", description: "字段网格、分组和表单布局。" },
  "form.create": { label: "创建流程", description: "创建/内联创建/弹窗创建流程。" },
  "form.input-adapter": { label: "输入适配", description: "把 Form spec 映射到通用输入/选择的适配层。" },
  "common.chrome": { label: "通用控件栏", description: "Toolbar、TabBar、Pagination 和页面控件渲染器。" },
  "common.action": { label: "通用动作", description: "ActionGlyph、ActionButton 和动作排序/分组协议。" },
  "common.input": { label: "通用输入", description: "输入字段、日期、文件、文本、开关和标签输入。" },
  "common.selection": { label: "通用选择", description: "选择器、FK 搜索、字段值筛选和 selector panel。" },
  "common.display": { label: "通用展示", description: "徽标、空态、代码块和通用展示基础件。" },
  "common.overlay": { label: "通用浮层", description: "下拉、浮层、详情弹窗和浮层基础件。" },
  "common.foundation": { label: "通用基础", description: "token、样式 recipe 和基础 helper。" },
  "feedback.service": { label: "反馈服务", description: "useFeedback 等业务反馈入口。" },
  "feedback.renderer": { label: "反馈渲染", description: "Toast、ConfirmModal 和 FeedbackProvider。" },
} as const satisfies Record<
  CoreUiComponentOwnerL2,
  { label: string; description: string }
>;

export const coreUiComponentRoleMeta = {
  entry: { label: "入口", description: "业务或主要公开入口。" },
  contract: { label: "协议", description: "只承载稳定类型/协议。" },
  renderer: { label: "渲染器", description: "Core 内部或 Surface 内部渲染器。" },
  primitive: { label: "基础件", description: "可组合的低层 UI 基础件。" },
  foundation: { label: "基础层", description: "样式、token、recipe 或非渲染基础材料。" },
  private: { label: "私有实现", description: "公开入口的私有实现。" },
} as const satisfies Record<
  CoreUiComponentRole,
  { label: string; description: string }
>;

export const coreUiComponentPublicUseMeta = {
  business: { label: "业务可用", description: "业务 runtime 可以直接使用的公开入口。" },
  "core-only": { label: "仅 Core", description: "只允许 Core 内部、Surface 渲染器或治理工具使用。" },
  "showcase-only": { label: "仅展示", description: "仅用于展示/预览，不作为业务 API。" },
} as const satisfies Record<
  CoreUiComponentPublicUse,
  { label: string; description: string }
>;

export const coreUiFrameMaturityMeta = {
  stable: {
    label: "稳定",
    description: "可作为 agent 默认页面骨架。",
  },
  tbc: {
    label: "待定",
    description: "候选骨架，需要继续验收和补 slot。",
  },
  "internal-only": {
    label: "内部",
    description: "只服务某个公开接口，不给 agent 选择。",
  },
} as const satisfies Record<
  import("./component-registry-types").CoreUiFrameMaturity,
  { label: string; description: string }
>;

export const CORE_UI_SHOWCASE_MAX_LEVEL = 3;

type CoreUiComponentLevelInput = {
  accessLayer: CoreUiComponentAccessLayer;
  uiLevel?: CoreUiComponentUiLevel;
  refLevel?: CoreUiComponentRefLevel;
};

export const coreUiComponentUiLevelMeta = {
  1: {
    label: "L1",
    description: "引用根层：PageSurface / FormSurface / DataSurface / useFeedback 等高层入口。",
    showcaseVisible: true,
  },
  2: {
    label: "L2",
    description: "能力承接层：L1 直接承接或引用的能力入口。",
    showcaseVisible: true,
  },
  3: {
    label: "L3",
    description: "内部实现层：L1/L2 背后的 renderer 或 primitive。",
    showcaseVisible: true,
  },
  4: {
    label: "L4+",
    description: "Foundation、private impl 和更深实现层，只作为 Core 内部依赖，不进入组件库主展示。",
    showcaseVisible: false,
  },
} as const satisfies Record<
  import("./component-registry-types").CoreUiComponentUiLevel,
  { label: string; description: string; showcaseVisible: boolean }
>;

export function resolveCoreUiComponentUiLevel(
  component: CoreUiComponentLevelInput,
): CoreUiComponentUiLevel {
  if (component.refLevel) return component.refLevel;
  if (component.uiLevel) return component.uiLevel;
  if (component.accessLayer === "foundation" || component.accessLayer === "private-impl") return 4;
  if (component.accessLayer === "core-internal") return 3;
  return 2;
}

export function isCoreUiComponentVisibleInShowcase(
  component: CoreUiComponentLevelInput,
) {
  return resolveCoreUiComponentUiLevel(component) <= CORE_UI_SHOWCASE_MAX_LEVEL;
}
