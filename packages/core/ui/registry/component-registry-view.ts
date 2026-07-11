import {
  coreUiComponentRegistry,
  getCoreUiDeclarationCategory,
  isCoreUiDeclarativeComponent,
} from "./component-registry";
import type { CoreUiComponentRegistration } from "./component-registry-types";
import type { CoreUiComponentTreeNode } from "./component-registry-view-utils";

export type { CoreUiComponentTreeNode } from "./component-registry-view-utils";

function compareComponentsByName(
  a: CoreUiComponentRegistration,
  b: CoreUiComponentRegistration,
) {
  return a.name.localeCompare(b.name);
}

export function buildCoreUiComponentTree(): CoreUiComponentTreeNode[] {
  return [...coreUiComponentRegistry]
    .filter(isCoreUiDeclarativeComponent)
    .sort(compareComponentsByName)
    .map((component) => ({
      component,
      name: component.name,
      category: getCoreUiDeclarationCategory(component),
    }));
}
