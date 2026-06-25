import { coreUiComponentKindMeta, coreUiComponentRegistry, getCoreUiCompositionGraph } from "./component-registry";
import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentKind,
  CoreUiComponentRegistration,
  CoreUiComponentTier,
} from "./component-registry-types";

export const coreUiComponentAccessLayerOrder = [
  "page-frame",
  "page-api",
  "core-internal",
  "foundation",
] as const satisfies readonly CoreUiComponentAccessLayer[];

export const coreUiComponentKindOrder = Object.keys(coreUiComponentKindMeta) as CoreUiComponentKind[];

function compareByAccessLayerOrder(
  a: CoreUiComponentAccessLayer,
  b: CoreUiComponentAccessLayer,
  order: readonly CoreUiComponentAccessLayer[] = coreUiComponentAccessLayerOrder,
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

export type CoreUiComponentTreeNode = {
  component: CoreUiComponentRegistration;
  name: string;
  tier: CoreUiComponentTier;
  accessLayer: CoreUiComponentAccessLayer;
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

export function buildComponentMap() {
  return new Map<string, CoreUiComponentRegistration>(
    coreUiComponentRegistry.map((component) => [component.name, component]),
  );
}

export function resolveComponents(
  names: readonly string[],
  componentByName: ReadonlyMap<string, CoreUiComponentRegistration>,
) {
  return names
    .map((name) => componentByName.get(name))
    .filter((component): component is CoreUiComponentRegistration => Boolean(component))
    .sort(compareComponentsByName);
}

export function groupComponentsByAccessLayerKind(
  components: readonly CoreUiComponentRegistration[],
) {
  const groups = new Map<string, {
    accessLayer: CoreUiComponentAccessLayer;
    kind: CoreUiComponentKind;
    components: CoreUiComponentRegistration[];
  }>();

  for (const component of components) {
    const key = `${component.accessLayer}:${component.kind}`;
    const group = groups.get(key) ?? {
      accessLayer: component.accessLayer,
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
      const layerOrder = compareByAccessLayerOrder(a.accessLayer, b.accessLayer);
      if (layerOrder !== 0) return layerOrder;
      const kindOrder = compareByKindOrder(a.kind, b.kind);
      return kindOrder !== 0 ? kindOrder : 0;
    });
}

export function groupUsageFiles(files: readonly string[]) {
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

export function getDependencyNames(componentName: string) {
  const graph = getCoreUiCompositionGraph();
  return [
    ...(graph.composes.get(componentName) ?? []),
    ...(graph.foundations.get(componentName) ?? []),
  ];
}

export function buildComponentTreeLeaf({
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
    accessLayer: component.accessLayer,
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

export function buildComponentTreeNode({
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
    accessLayer: component.accessLayer,
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
