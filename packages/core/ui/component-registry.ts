import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentOwnerL1,
  CoreUiComponentOwnerL2,
  CoreUiComponentPublicUse,
  CoreUiComponentRole,
  CoreUiComponentUiLevel,
} from "./component-registry-types";

export type {
  CoreUiComponentKind,
  CoreUiComponentAccessLayer,
  CoreUiFrameMaturity,
  CoreUiComponentUiLevel,
  CoreUiComponentOwnerL1,
  CoreUiComponentOwnerL2,
  CoreUiComponentRole,
  CoreUiComponentPublicUse,
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
    label: "Page",
    description: "页面骨架和页面内 body renderer 的归属 family。",
  },
  data: {
    label: "Data",
    description: "数据视图、表格、记录、指标、图表和数据单元格。",
  },
  form: {
    label: "Form",
    description: "表单正文、字段布局、创建流和表单输入适配。",
  },
  common: {
    label: "Common",
    description: "跨 Page/Data/Form/Feedback 复用的 chrome、action、input、selection、display、overlay 和 foundation。",
  },
  feedback: {
    label: "Feedback",
    description: "反馈服务、反馈 renderer 和历史兼容反馈入口。",
  },
} as const satisfies Record<
  CoreUiComponentOwnerL1,
  { label: string; description: string }
>;

export const coreUiComponentOwnerL2Meta = {
  "page.surface": { label: "Page Surface", description: "PageSurface 入口和页面协议。" },
  "page.blocks": { label: "Page Blocks", description: "PageSurface body 可组合的页面内容块。" },
  "page.frame": { label: "Page Frame", description: "页面骨架、内容容器和 frame renderer。" },
  "page.document": { label: "Page Document", description: "纸面/A4/报告正文 renderer。" },
  "data.surface": { label: "Data Surface", description: "DataSurface 入口和数据正文协议。" },
  "data.table": { label: "Data Table", description: "表格、滚动外壳和结构化表。" },
  "data.record": { label: "Data Record", description: "记录卡、展开记录和行级阅读。" },
  "data.metric": { label: "Data Metric", description: "指标卡、指标瓦片和数据摘要。" },
  "data.visual": { label: "Data Visual", description: "图表/可视化数据 renderer。" },
  "data.cell": { label: "Data Cell", description: "数据单元格和数值格式化展示。" },
  "form.surface": { label: "Form Surface", description: "FormSurface 入口和表单正文协议。" },
  "form.field": { label: "Form Field", description: "字段容器和字段 contract。" },
  "form.layout": { label: "Form Layout", description: "字段网格、分组和表单布局。" },
  "form.create": { label: "Form Create", description: "创建/内联创建/弹窗创建流程。" },
  "form.input-adapter": { label: "Form Input Adapter", description: "把 Form spec 映射到 Common input/selection 的适配层。" },
  "common.chrome": { label: "Common Chrome", description: "Toolbar、TabBar、Pagination 和页面 chrome renderer。" },
  "common.action": { label: "Common Action", description: "ActionGlyph、ActionButton 和动作排序/分组 contract。" },
  "common.input": { label: "Common Input", description: "输入字段、日期、文件、文本、开关和 tag input。" },
  "common.selection": { label: "Common Selection", description: "选择器、FK 搜索、字段值筛选和 selector panel。" },
  "common.display": { label: "Common Display", description: "徽标、空态、代码块和通用展示 primitive。" },
  "common.overlay": { label: "Common Overlay", description: "下拉、浮层、详情 modal 和 overlay primitive。" },
  "common.foundation": { label: "Common Foundation", description: "token、样式 recipe 和 foundation helper。" },
  "feedback.service": { label: "Feedback Service", description: "useFeedback 等业务反馈入口。" },
  "feedback.renderer": { label: "Feedback Renderer", description: "Toast、ConfirmModal 和 FeedbackProvider。" },
  "feedback.compat": { label: "Feedback Compat", description: "历史确认/反馈兼容入口。" },
} as const satisfies Record<
  CoreUiComponentOwnerL2,
  { label: string; description: string }
>;

export const coreUiComponentRoleMeta = {
  entry: { label: "Entry", description: "业务或主要公开入口。" },
  contract: { label: "Contract", description: "只承载稳定类型/协议。" },
  renderer: { label: "Renderer", description: "Core 内部或 Surface 内部 renderer。" },
  primitive: { label: "Primitive", description: "可组合的低层 UI primitive。" },
  foundation: { label: "Foundation", description: "样式、token、recipe 或非渲染基础材料。" },
  private: { label: "Private", description: "公开入口的私有实现。" },
} as const satisfies Record<
  CoreUiComponentRole,
  { label: string; description: string }
>;

export const coreUiComponentPublicUseMeta = {
  business: { label: "Business", description: "业务 runtime 可以直接使用的公开入口。" },
  "core-only": { label: "Core-only", description: "只允许 Core 内部、Surface renderer 或治理工具使用。" },
  "showcase-only": { label: "Showcase-only", description: "仅用于展示/预览，不作为业务 API。" },
  compat: { label: "Compat", description: "历史兼容入口，迁移目标是替换或收口。" },
} as const satisfies Record<
  CoreUiComponentPublicUse,
  { label: string; description: string }
>;

export const coreUiFrameMaturityMeta = {
  stable: {
    label: "Stable",
    description: "可作为 agent 默认页面骨架。",
  },
  tbc: {
    label: "TBC",
    description: "候选骨架，需要继续验收和补 slot。",
  },
  "internal-only": {
    label: "Internal-only",
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
};

export const coreUiComponentUiLevelMeta = {
  1: {
    label: "L1",
    description: "公开入口：PageSurface / FormSurface / DataSurface / useFeedback。页面布局只能从 PageSurface 进入。",
    showcaseVisible: true,
  },
  2: {
    label: "L2",
    description: "Surface 的 kind / variant / spec 能力层，过渡期保留旧 Page API 阅读。",
    showcaseVisible: true,
  },
  3: {
    label: "L3",
    description: "Core 内部可见组合层，供关系图、迁移和 review 使用。",
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
