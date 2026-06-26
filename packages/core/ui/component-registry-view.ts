import {
  coreUiComponentRegistry,
  getCoreUiCompositionGraph,
  isCoreUiComponentVisibleInShowcase,
} from "./component-registry";
import { buildComponentNestDepthMap } from "./component-nest-depth";
import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentKind,
  CoreUiComponentRegistration,
} from "./component-registry-types";
import {
  buildComponentMap,
  buildComponentTreeNode,
  groupComponentsByAccessLayerKind,
  groupUsageFiles,
  resolveComponents,
  type CoreUiComponentTreeNode,
} from "./component-registry-view-utils";

export type { CoreUiComponentTreeNode } from "./component-registry-view-utils";

export type CoreUiComponentRelationView = {
  component: CoreUiComponentRegistration;
  composes: CoreUiComponentRegistration[];
  foundations: CoreUiComponentRegistration[];
  usedByGrouped: Array<{
    accessLayer: CoreUiComponentAccessLayer;
    kind: CoreUiComponentKind;
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
  const foundations = resolveComponents(graph.foundations.get(componentName) ?? [], componentByName)
    .filter(isCoreUiComponentVisibleInShowcase);
  const usedBy = resolveComponents(graph.usedBy.get(componentName) ?? [], componentByName)
    .filter(isCoreUiComponentVisibleInShowcase);

  return {
    component,
    composes,
    foundations,
    usedByGrouped: groupComponentsByAccessLayerKind(usedBy),
    usageFilesGrouped: groupUsageFiles(usageFiles),
  };
}
