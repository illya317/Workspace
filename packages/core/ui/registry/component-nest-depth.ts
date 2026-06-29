import { getCoreUiCompositionGraph } from "./component-registry";

function getDependencyNames(componentName: string) {
  const graph = getCoreUiCompositionGraph();
  return graph.composes.get(componentName) ?? [];
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

export const NEST_DEPTH_CAP = 5;

export function formatNestDepth(depth: number): string {
  if (depth >= NEST_DEPTH_CAP) return `${NEST_DEPTH_CAP}+`;
  return `${depth}+`;
}

export function nestDepthBadgeClasses(depth: number): string {
  if (depth === 1) return "bg-slate-200 text-slate-800";
  if (depth === 2) return "bg-emerald-200 text-emerald-800";
  if (depth === 3) return "bg-blue-200 text-blue-800";
  if (depth === 4) return "bg-orange-200 text-orange-800";
  return "bg-red-200 text-red-800";
}
