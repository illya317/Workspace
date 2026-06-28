export type CoreUiComponentCategory = "page" | "data" | "form" | "common" | "feedback";

export type CoreUiComponentSubcategory =
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

export type CoreUiExposure =
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

export type CoreUiCapabilityDescriptor = {
  name: string;
  description: string;
};

export type CoreUiComponentRegistration = {
  name: string;
  description: string;
  example: string;
  verified?: boolean;

  exposure?: CoreUiExposure;

  // 业务/Agent 可声明的字段项。
  declares?: readonly CoreUiCapabilityDescriptor[];

  /**
   * Core UI 分类 taxonomy.
   *
   * `category/subcategory` controls architectural classification. Missing fields
   * are allowed during the first migration phase and are reported as warning-only
   * hygiene debt.
   */
  category?: CoreUiComponentCategory;
  subcategory?: CoreUiComponentSubcategory;

  // 组件或 helper 直接组合了哪些 core UI 入口。
  composes?: readonly string[];
};

export type CoreUiCompositionGraph = {
  composes: ReadonlyMap<string, readonly string[]>;
  usedBy: ReadonlyMap<string, readonly string[]>;
};
