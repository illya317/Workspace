import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentUiLevel,
} from "./component-registry-types";

export type {
  CoreUiComponentKind,
  CoreUiComponentAccessLayer,
  CoreUiFrameMaturity,
  CoreUiComponentUiLevel,
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
    description: "公开入口：PageSurface / FormSurface / DataSurface / NavigationSurface / useFeedback。",
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
