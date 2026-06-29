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
  "VisualizationSurface",
]);

export const coreUiDeclarationCategoryMeta = {
  "page-layout": {
    label: "页面布局",
    description: "PageSurface 及页面级布局、导航、工具栏、页脚声明。",
  },
  "page-content": {
    label: "页面内容",
    description: "Body 下的正文声明能力：data、form、document、visualization。",
  },
  common: {
    label: "通用",
    description: "输入、导航、选择区等其他可复用声明封装。",
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
