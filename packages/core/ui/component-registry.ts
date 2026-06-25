export type {
  CoreUiComponentKind,
  CoreUiComponentTier,
  CoreUiComponentAccessLayer,
  CoreUiFrameMaturity,
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
} from "./component-registry-types";

export {
  coreUiComponentRegistry,
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

export const coreUiComponentTierMeta = {
  foundation: {
    label: "风格基础",
    description: "非业务、非页面的样式配方、标记与类辅助。定义元素级视觉语言，但不一定是组件。",
  },
  primitive: {
    label: "原子组件",
    description: "最小可交互组件或稳定微展示单元，组合风格基础配方但不组合复杂业务结构。",
  },
  assembly: {
    label: "常用组合",
    description: "由原子组件组合而成的可复用模式，可能有布局观点但不含业务事实。",
  },
  shell: {
    label: "页面接口",
    description: "页面接口（Page API）层：智能体直接引用的可复用顶层容器；当前被页面框架引用而自动提升，未来可能进一步下沉或保留为智能体可见层。",
  },
  frame: {
    label: "页面框架",
    description: "页面或工作区骨架，定义内容区域之间的结构关系。",
  },
} as const satisfies Record<
  import("./component-registry-types").CoreUiComponentTier,
  { label: string; description: string }
>;

export const coreUiComponentAccessLayerMeta = {
  "page-frame": {
    label: "Page Frame",
    description: "页面骨架。只管理页面结构，不包含业务事实。",
    agentSelectable: false,
  },
  "page-api": {
    label: "Page API",
    description: "业务页 / agent 可以直接使用的公开 UI 接口。",
    agentSelectable: true,
  },
  "core-internal": {
    label: "Core Internal",
    description: "只服务 Page API 的内部组合。关系图可见，但不作为 agent 可选组件。",
    agentSelectable: false,
  },
  foundation: {
    label: "Foundation",
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
