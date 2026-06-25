import {
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  getCoreUiCompositionGraph,
  type CoreUiComponentKind,
  type CoreUiComponentRegistration,
  type CoreUiComponentTier,
} from "./component-registry";
import { buildComponentNestDepthMap } from "./component-nest-depth";

export const coreUiComponentUsedByTierOrder = [
  "frame",
  "shell",
  "assembly",
  "primitive",
  "foundation",
] as const satisfies readonly CoreUiComponentTier[];

export const coreUiComponentKindOrder = Object.keys(coreUiComponentKindMeta) as CoreUiComponentKind[];

export type CoreUiComponentTreeNode = {
  component: CoreUiComponentRegistration;
  name: string;
  tier: CoreUiComponentTier;
  kind: CoreUiComponentKind;
  depth: number;
  nestDepth: number;
  path: string[];
  verified: boolean;
  dependencyCount: number;
  usedByCount: number;
  usageFileCount: number;
  hasChildren: boolean;
  children: CoreUiComponentTreeNode[];
};

export type CoreUiComponentRelationView = {
  component: CoreUiComponentRegistration;
  composes: CoreUiComponentRegistration[];
  foundations: CoreUiComponentRegistration[];
  usedByGrouped: Array<{
    tier: CoreUiComponentTier;
    kind: CoreUiComponentKind;
    components: CoreUiComponentRegistration[];
  }>;
  usageFilesGrouped: Array<{
    group: string;
    files: string[];
  }>;
};

function compareByTierOrder(
  a: CoreUiComponentTier,
  b: CoreUiComponentTier,
  order: readonly CoreUiComponentTier[],
) {
  return order.indexOf(a) - order.indexOf(b);
}

function compareByKindOrder(a: CoreUiComponentKind, b: CoreUiComponentKind) {
  return coreUiComponentKindOrder.indexOf(a) - coreUiComponentKindOrder.indexOf(b);
}

function compareComponentsByName(
  a: CoreUiComponentRegistration,
  b: CoreUiComponentRegistration,
) {
  return a.name.localeCompare(b.name);
}

function buildComponentMap() {
  return new Map<string, CoreUiComponentRegistration>(
    coreUiComponentRegistry.map((component) => [component.name, component]),
  );
}

function resolveComponents(
  names: readonly string[],
  componentByName: ReadonlyMap<string, CoreUiComponentRegistration>,
) {
  return names
    .map((name) => componentByName.get(name))
    .filter((component): component is CoreUiComponentRegistration => Boolean(component))
    .sort(compareComponentsByName);
}

function groupComponentsByTierKind(
  components: readonly CoreUiComponentRegistration[],
) {
  const groups = new Map<string, {
    tier: CoreUiComponentTier;
    kind: CoreUiComponentKind;
    components: CoreUiComponentRegistration[];
  }>();

  for (const component of components) {
    const key = `${component.tier}:${component.kind}`;
    const group = groups.get(key) ?? {
      tier: component.tier,
      kind: component.kind,
      components: [],
    };
    group.components.push(component);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      components: group.components.sort(compareComponentsByName),
    }))
    .sort((a, b) => {
      const tierOrder = compareByTierOrder(a.tier, b.tier, coreUiComponentUsedByTierOrder);
      if (tierOrder !== 0) return tierOrder;
      const kindOrder = compareByKindOrder(a.kind, b.kind);
      return kindOrder !== 0 ? kindOrder : 0;
    });
}

function groupUsageFiles(files: readonly string[]) {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const group = file.startsWith("app/")
      ? "app"
      : file.startsWith("packages/")
        ? file.split("/").slice(0, 2).join("/")
        : file.split("/")[0] || "other";
    const list = groups.get(group) ?? [];
    list.push(file);
    groups.set(group, list);
  }

  return [...groups.entries()]
    .map(([group, groupFiles]) => ({
      group,
      files: [...new Set(groupFiles)].sort(),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

function getDependencyNames(componentName: string) {
  const graph = getCoreUiCompositionGraph();
  return [
    ...(graph.composes.get(componentName) ?? []),
    ...(graph.foundations.get(componentName) ?? []),
  ];
}

function buildComponentTreeLeaf({
  component,
  nestDepthByName,
  verifiedNames,
  usageFilesByName,
  path,
  depth,
}: {
  component: CoreUiComponentRegistration;
  nestDepthByName: ReadonlyMap<string, number>;
  verifiedNames?: ReadonlySet<string>;
  usageFilesByName?: ReadonlyMap<string, readonly string[]>;
  path: string[];
  depth: number;
}): CoreUiComponentTreeNode {
  const graph = getCoreUiCompositionGraph();
  const dependencyNames = [...new Set(getDependencyNames(component.name))].sort();
  return {
    component,
    name: component.name,
    tier: component.tier,
    kind: component.kind,
    depth,
    nestDepth: nestDepthByName.get(component.name) ?? 1,
    path,
    verified: Boolean(verifiedNames?.has(component.name)),
    dependencyCount: dependencyNames.length,
    usedByCount: graph.usedBy.get(component.name)?.length ?? 0,
    usageFileCount: usageFilesByName?.get(component.name)?.length ?? 0,
    hasChildren: false,
    children: [],
  };
}

function buildComponentTreeNode({
  component,
  componentByName,
  nestDepthByName,
  verifiedNames,
  usageFilesByName,
  path,
  depth,
}: {
  component: CoreUiComponentRegistration;
  componentByName: ReadonlyMap<string, CoreUiComponentRegistration>;
  nestDepthByName: ReadonlyMap<string, number>;
  verifiedNames?: ReadonlySet<string>;
  usageFilesByName?: ReadonlyMap<string, readonly string[]>;
  path: string[];
  depth: number;
}): CoreUiComponentTreeNode {
  const graph = getCoreUiCompositionGraph();
  const dependencyNames = [...new Set(getDependencyNames(component.name))].sort();
  const nextPath = [...path, component.name];
  const canExpand = depth < 3;
  const children = canExpand
    ? dependencyNames
      .map((name) => componentByName.get(name))
      .filter((child): child is CoreUiComponentRegistration => Boolean(child))
      .sort(compareComponentsByName)
      .map((child) => {
        const childPath = [...nextPath, child.name];
        if (nextPath.includes(child.name)) {
          return buildComponentTreeLeaf({
            component: child,
            nestDepthByName,
            verifiedNames,
            usageFilesByName,
            path: childPath,
            depth: depth + 1,
          });
        }
        return buildComponentTreeNode({
          component: child,
          componentByName,
          nestDepthByName,
          verifiedNames,
          usageFilesByName,
          path: nextPath,
          depth: depth + 1,
        });
      })
    : [];

  return {
    component,
    name: component.name,
    tier: component.tier,
    kind: component.kind,
    depth,
    nestDepth: nestDepthByName.get(component.name) ?? 1,
    path: nextPath,
    verified: Boolean(verifiedNames?.has(component.name)),
    dependencyCount: dependencyNames.length,
    usedByCount: graph.usedBy.get(component.name)?.length ?? 0,
    usageFileCount: usageFilesByName?.get(component.name)?.length ?? 0,
    hasChildren: canExpand && dependencyNames.length > 0,
    children,
  };
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
    .filter((component) => component.tier !== "foundation")
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

  const composes = resolveComponents(graph.composes.get(componentName) ?? [], componentByName);
  const foundations = resolveComponents(graph.foundations.get(componentName) ?? [], componentByName);
  const usedBy = resolveComponents(graph.usedBy.get(componentName) ?? [], componentByName);

  return {
    component,
    composes,
    foundations,
    usedByGrouped: groupComponentsByTierKind(usedBy),
    usageFilesGrouped: groupUsageFiles(usageFiles),
  };
}
