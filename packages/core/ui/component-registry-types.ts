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
export type CoreUiComponentRefLevel = CoreUiComponentUiLevel;

export type CoreUiComponentOwnerL1 = "page" | "data" | "form" | "common" | "feedback";

export type CoreUiComponentOwnerL2 =
  | "page.surface"
  | "page.blocks"
  | "page.frame"
  | "page.document"
  | "data.surface"
  | "data.table"
  | "data.record"
  | "data.metric"
  | "data.visual"
  | "data.cell"
  | "form.surface"
  | "form.field"
  | "form.layout"
  | "form.create"
  | "form.input-adapter"
  | "common.chrome"
  | "common.action"
  | "common.input"
  | "common.selection"
  | "common.display"
  | "common.overlay"
  | "common.foundation"
  | "feedback.service"
  | "feedback.renderer";

export type CoreUiComponentRole =
  | "entry"
  | "contract"
  | "renderer"
  | "primitive"
  | "foundation"
  | "private";

export type CoreUiComponentPublicUse =
  | "business"
  | "core-only"
  | "showcase-only";

export type CoreUiAgentExposure =
  | {
      mode: "direct";
    }
  | {
      mode: "via";
      entry: string;
      path: string;
    }
  | {
      mode: "internal";
    };

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
   * 引用层级 / 实现层级。
   * - L1: 开放根组件。
   * - L2: L1 直接承接或引用的能力入口。
   * - L3: L1/L2 内部 renderer。
   * - L4: Foundation / private impl / 更深实现层。
   *
   * 未填写时按 accessLayer 派生，保留旧 registry 的渐进迁移能力。
   */
  uiLevel?: CoreUiComponentUiLevel;
  refLevel?: CoreUiComponentRefLevel;
  agentExposure?: CoreUiAgentExposure;

  /**
   * Core UI ownership taxonomy.
   *
   * `uiLevel` controls visibility; `ownerL1/ownerL2` controls architectural
   * ownership. Missing fields are allowed during the first migration phase and
   * are reported as warning-only hygiene debt.
   */
  ownerL1?: CoreUiComponentOwnerL1;
  ownerL2?: CoreUiComponentOwnerL2;
  role?: CoreUiComponentRole;
  publicUse?: CoreUiComponentPublicUse;

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
