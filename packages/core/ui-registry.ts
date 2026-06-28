export {
  coreUiComponentCategoryMeta,
  coreUiComponentRegistry,
  coreUiComponentSubcategoryMeta,
  getCoreUiCompositionGraph,
  isCoreUiComponentVisibleInShowcase,
  registeredCoreUiComponentNames,
} from "./ui/component-registry";
export type {
  CoreUiComponentCategory,
  CoreUiCapabilityDescriptor,
  CoreUiComponentRegistration,
  CoreUiComponentRole,
  CoreUiComponentSubcategory,
  CoreUiExposure,
} from "./ui/component-registry";
export {
  buildCoreUiComponentTree,
  getCoreUiComponentRelationView,
} from "./ui/component-registry-view";
export type {
  CoreUiComponentRelationView,
  CoreUiComponentTreeNode,
} from "./ui/component-registry-view";
export { computeComponentNestDepth } from "./ui/component-nest-depth";
