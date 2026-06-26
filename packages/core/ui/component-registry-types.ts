export type CoreUiComponentKind =
  | "cell"
  | "data"
  | "feedback"
  | "form"
  | "layout"
  | "navigation"
  | "overlay"
  | "picker"
  | "status"
  | "toolbar";

export type CoreUiComponentAccessLayer =
  | "page-frame"
  | "page-api"
  | "core-internal"
  | "foundation"
  | "private-impl";

export type CoreUiFrameMaturity = "stable" | "tbc" | "internal-only";

export type CoreUiComponentUiLevel = 1 | 2 | 3 | 4;

export type CoreUiComponentRegistration = {
  name: string;
  kind: CoreUiComponentKind;
  description: string;
  example: string;
  verified?: boolean;

  /**
   * 新五层开放面。
   * - page-frame: 页面骨架，agent 默认只能使用 stable frame。
   * - page-api: 业务页 / agent 可直接使用的公开 UI 接口。
   * - core-internal: 只服务 Page API 的内部组合，不作为 agent 可选组件。
   * - foundation: 样式配方 / token / glyph taxonomy，伪注册为材料。
   * - private-impl: 公开 UI 的私有实现文件，不注册、不展示为独立 UI。
   */
  accessLayer: CoreUiComponentAccessLayer;

  /**
   * UI 组件库展示层级。
   * - L1: 业务 / agent 的公开入口。当前只允许 Surface 与 useFeedback。
   * - L2: L1 的 kind / variant / spec 能力对应的组合件。
   * - L3: Core 内部可见组合层，供关系图和迁移阅读。
   * - L4: Foundation / private impl / 更深实现层，不进入组件库主展示。
   *
   * 未填写时按 accessLayer 派生，保留旧 registry 的渐进迁移能力。
   */
  uiLevel?: CoreUiComponentUiLevel;

  /**
   * Page Frame 成熟度。只有 accessLayer === "page-frame" 才有意义。
   * - stable: 可作为 agent 默认页面骨架。
   * - tbc: 候选骨架，需要继续验收和补 slot。
   * - internal-only: 只服务某个公开接口，不给 agent 选择。
   */
  frameMaturity?: CoreUiFrameMaturity;

  /**
   * Foundation 伪注册标记。
   * 可在关系图中出现、可被 foundations 引用、可在 /settings/ui 显示为材料/依赖，
   * 但不作为可渲染组件，也不作为 agent 可选 UI。
   */
  pseudoRegistered?: boolean;

  /**
   * Private Impl 的所属公开 UI。只有 accessLayer === "private-impl" 才有意义。
   */
  ownedBy?: string;

  // 组件或 helper 直接组合了哪些 core UI 入口。
  composes?: readonly string[];

  // 使用了哪些 foundation recipe / token / class helper。
  foundations?: readonly string[];

  // 兼容旧字段；后续可以逐步迁移为 composes。
  includes?: readonly string[];
};

export type CoreUiCompositionGraph = {
  composes: ReadonlyMap<string, readonly string[]>;
  foundations: ReadonlyMap<string, readonly string[]>;
  usedBy: ReadonlyMap<string, readonly string[]>;
};
