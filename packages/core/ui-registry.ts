export {
  coreUiComponentCategoryMeta,
  coreUiComponentRegistry,
  coreUiComponentSubcategoryMeta,
  getCoreUiCompositionGraph,
  isCoreUiComponentVisibleInShowcase,
  registeredCoreUiComponentNames,
} from "./ui/registry/component-registry";
export type {
  CoreUiComponentCategory,
  CoreUiCapabilityDescriptor,
  CoreUiComponentRegistration,
  CoreUiComponentRole,
  CoreUiComponentSubcategory,
  CoreUiExposure,
} from "./ui/registry/component-registry";
export {
  buildCoreUiComponentTree,
  getCoreUiComponentRelationView,
} from "./ui/registry/component-registry-view";
export type {
  CoreUiComponentRelationView,
  CoreUiComponentTreeNode,
} from "./ui/registry/component-registry-view";
export { computeComponentNestDepth } from "./ui/registry/component-nest-depth";
