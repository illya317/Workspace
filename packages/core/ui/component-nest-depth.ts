import { getCoreUiCompositionGraph } from "./component-registry";

function getDependencyNames(componentName: string) {
  const graph = getCoreUiCompositionGraph();
  return [
    ...(graph.composes.get(componentName) ?? []),
    ...(graph.foundations.get(componentName) ?? []),
  ];
}

export function computeComponentNestDepth(
  componentName: string,
  memo: Map<string, number> = new Map(),
  visiting: Set<string> = new Set(),
): number {
  if (memo.has(componentName)) return memo.get(componentName)!;
  if (visiting.has(componentName)) return 1;

  visiting.add(componentName);
  const dependencyNames = [...new Set(getDependencyNames(componentName))];
  const maxChildDepth = dependencyNames.length > 0
    ? Math.max(...dependencyNames.map((name) => computeComponentNestDepth(name, memo, visiting)))
    : 0;
  visiting.delete(componentName);

  const depth = 1 + maxChildDepth;
  memo.set(componentName, depth);
  return depth;
}

export function buildComponentNestDepthMap(componentNames: readonly string[]): Map<string, number> {
  const nestDepthByName = new Map<string, number>();
  for (const name of componentNames) {
    nestDepthByName.set(name, computeComponentNestDepth(name, nestDepthByName));
  }
  return nestDepthByName;
}
