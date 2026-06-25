import {
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  getCoreUiCompositionGraph,
  type CoreUiComponentKind,
  type CoreUiComponentRegistration,
  type CoreUiComponentTier,
} from "./component-registry";

export const coreUiComponentTierOrder = [
  "foundation",
  "primitive",
  "assembly",
  "shell",
  "frame",
] as const satisfies readonly CoreUiComponentTier[];

export const coreUiComponentUsedByTierOrder = [
  "frame",
  "shell",
  "assembly",
  "primitive",
  "foundation",
] as const satisfies readonly CoreUiComponentTier[];

export const coreUiComponentKindOrder = Object.keys(coreUiComponentKindMeta) as CoreUiComponentKind[];

export type CoreUiRegistryTreeNode = {
  component: CoreUiComponentRegistration;
  name: string;
  tier: CoreUiComponentTier;
  kind: CoreUiComponentKind;
  verified: boolean;
  directDependencyCount: number;
  directUsedByCount: number;
  usageFileCount: number;
};

export type CoreUiRegistryTreeGroup = {
  tier: CoreUiComponentTier;
  tierLabel: string;
  kinds: Array<{
    kind: CoreUiComponentKind;
    kindLabel: string;
    nodes: CoreUiRegistryTreeNode[];
  }>;
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

export function buildCoreUiRegistryTreeGroups({
  verifiedNames,
  usageFilesByName,
}: {
  verifiedNames?: ReadonlySet<string>;
  usageFilesByName?: ReadonlyMap<string, readonly string[]>;
} = {}): CoreUiRegistryTreeGroup[] {
  const graph = getCoreUiCompositionGraph();
  const groups = new Map<CoreUiComponentTier, Map<CoreUiComponentKind, CoreUiRegistryTreeNode[]>>();

  for (const component of [...coreUiComponentRegistry].sort(compareComponentsByName)) {
    const tierGroup = groups.get(component.tier) ?? new Map<CoreUiComponentKind, CoreUiRegistryTreeNode[]>();
    const nodes = tierGroup.get(component.kind) ?? [];
    const composes = graph.composes.get(component.name) ?? [];
    const foundations = graph.foundations.get(component.name) ?? [];
    const usedBy = graph.usedBy.get(component.name) ?? [];
    nodes.push({
      component,
      name: component.name,
      tier: component.tier,
      kind: component.kind,
      verified: Boolean(verifiedNames?.has(component.name)),
      directDependencyCount: composes.length + foundations.length,
      directUsedByCount: usedBy.length,
      usageFileCount: usageFilesByName?.get(component.name)?.length ?? 0,
    });
    tierGroup.set(component.kind, nodes);
    groups.set(component.tier, tierGroup);
  }

  return coreUiComponentTierOrder.flatMap((tier) => {
    const tierGroup = groups.get(tier);
    if (!tierGroup) return [];
    return [{
      tier,
      tierLabel: coreUiComponentTierMeta[tier].label,
      kinds: coreUiComponentKindOrder.flatMap((kind) => {
        const nodes = tierGroup.get(kind);
        if (!nodes?.length) return [];
        return [{
          kind,
          kindLabel: coreUiComponentKindMeta[kind].label,
          nodes,
        }];
      }),
    }];
  });
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
