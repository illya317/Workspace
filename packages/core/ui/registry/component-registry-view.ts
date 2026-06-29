import {
  coreUiComponentRegistry,
  getCoreUiCompositionGraph,
  isCoreUiComponentVisibleInShowcase,
} from "./component-registry";
import { buildComponentNestDepthMap } from "./component-nest-depth";
import type {
  CoreUiComponentRegistration,
  CoreUiComponentSubcategory,
} from "./component-registry-types";
import {
  buildComponentMap,
  buildComponentTreeNode,
  groupComponentsBySubcategory,
  groupUsageFiles,
  resolveComponents,
  type CoreUiComponentTreeNode,
} from "./component-registry-view-utils";

export type { CoreUiComponentTreeNode } from "./component-registry-view-utils";

export type CoreUiComponentRelationView = {
  component: CoreUiComponentRegistration;
  composes: CoreUiComponentRegistration[];
  usedByGrouped: Array<{
    subcategory: CoreUiComponentSubcategory;
    components: CoreUiComponentRegistration[];
  }>;
  usageFilesGrouped: Array<{
    group: string;
    files: string[];
  }>;
};

function compareComponentsByName(
  a: CoreUiComponentRegistration,
  b: CoreUiComponentRegistration,
) {
  return a.name.localeCompare(b.name);
}

export function buildCoreUiComponentTree({
  verifiedNames,
  usageFilesByName,
}: {
  verifiedNames?: ReadonlySet<string>;
  usageFilesByName?: ReadonlyMap<string, readonly string[]>;
} = {}): CoreUiComponentTreeNode[] {
  const componentByName = buildComponentMap();
  const nestDepthByName = buildComponentNestDepthMap(
    coreUiComponentRegistry.map((component) => component.name),
  );

  return [...coreUiComponentRegistry]
    .filter(isCoreUiComponentVisibleInShowcase)
    .sort(compareComponentsByName)
    .map((component) => buildComponentTreeNode({
      component,
      componentByName,
      nestDepthByName,
      verifiedNames,
      usageFilesByName,
      path: [],
      depth: 1,
    }));
}

export function getCoreUiComponentRelationView(
  componentName: string,
  { usageFiles = [] }: { usageFiles?: readonly string[] } = {},
): CoreUiComponentRelationView | null {
  const graph = getCoreUiCompositionGraph();
  const componentByName = buildComponentMap();
  const component = componentByName.get(componentName);
  if (!component) return null;

  const composes = resolveComponents(graph.composes.get(componentName) ?? [], componentByName)
    .filter(isCoreUiComponentVisibleInShowcase);
  const usedBy = resolveComponents(graph.usedBy.get(componentName) ?? [], componentByName)
    .filter(isCoreUiComponentVisibleInShowcase);

  return {
    component,
    composes,
    usedByGrouped: groupComponentsBySubcategory(usedBy),
    usageFilesGrouped: groupUsageFiles(usageFiles),
  };
}
