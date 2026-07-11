export {
  coreUiDeclarationCategoryMeta,
  coreUiComponentRegistry,
  getCoreUiDeclarationCategory,
  getCoreUiCompositionGraph,
  isCoreUiDeclarativeComponent,
  registeredCoreUiComponentNames,
} from "./ui/registry/component-registry";
export type {
  CoreUiCapabilityDescriptor,
  CoreUiComponentRegistration,
  CoreUiDeclarationCategory,
} from "./ui/registry/component-registry";
export {
  buildCoreUiComponentTree,
} from "./ui/registry/component-registry-view";
export type {
  CoreUiComponentTreeNode,
} from "./ui/registry/component-registry-view";
export { computeComponentNestDepth } from "./ui/registry/component-nest-depth";
