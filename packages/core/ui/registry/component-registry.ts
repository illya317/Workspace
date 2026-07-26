import type {
  CoreUiDeclarationCategory,
  CoreUiComponentRegistration,
} from "./component-registry-types";

export type {
  CoreUiDeclarationCategory,
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

const PAGE_LAYOUT_DECLARATIONS = new Set([
  "PageSurface",
]);

const PAGE_CONTENT_DECLARATIONS = new Set([
  "BodySurface",
  "DataSurface",
  "DocumentSurface",
  "FormSurface",
  "CreateSurface",
  "PaperInputSurface",
  "SelectorSurface",
  "VisualizationSurface",
]);

export const coreUiDeclarationCategoryMeta = {
  "page-layout": {
    label: "页面布局",
    description: "PageSurface 及页面级 tabbar、toolbar、body、footer 声明；header 由 Platform AppShell 唯一拥有。",
  },
  "page-content": {
    label: "页面内容",
    description: "Body 下的正文与纸面声明能力：create、data、document、form、paper input、selector、visualization。",
  },
  common: {
    label: "通用",
    description: "跨正文复用的字段输入与导航声明。",
  },
} as const satisfies Record<
  CoreUiDeclarationCategory,
  { label: string; description: string }
>;

export function isCoreUiDeclarativeComponent(
  component: Pick<CoreUiComponentRegistration, "declares">,
) {
  return (component.declares?.length ?? 0) > 0;
}

export function getCoreUiDeclarationCategory(
  component: Pick<CoreUiComponentRegistration, "name">,
): CoreUiDeclarationCategory {
  if (PAGE_LAYOUT_DECLARATIONS.has(component.name)) return "page-layout";
  if (PAGE_CONTENT_DECLARATIONS.has(component.name)) return "page-content";
  return "common";
}
