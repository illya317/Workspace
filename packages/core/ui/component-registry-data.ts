import type {
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
} from "./component-registry-types";
import { core_internal_registry_entries } from "./component-registry-data-core-internal";
import { foundation_registry_entries } from "./component-registry-data-foundation";
import { page_api_registry_entries as pageApiAM } from "./component-registry-data-page-api-a-m";
import { page_api_registry_entries as pageApiNZ } from "./component-registry-data-page-api-n-z";
import { page_frame_registry_entries } from "./component-registry-data-frame";

const coreUiComponentRegistryRaw = [
  ...page_frame_registry_entries,
  ...pageApiAM,
  ...pageApiNZ,
  ...core_internal_registry_entries,
  ...foundation_registry_entries,
] as const satisfies readonly CoreUiComponentRegistration[];

function buildCoreUiCompositionGraph(
  registrations: readonly CoreUiComponentRegistration[],
): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const foundations = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const registration of registrations) {
    const compositionTargets = registration.composes ?? registration.includes ?? [];
    const foundationTargets = registration.foundations ?? [];

    composes.set(registration.name, compositionTargets);
    foundations.set(registration.name, foundationTargets);

    for (const target of compositionTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
    for (const target of foundationTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
  }

  const sortedUsedBy = new Map<string, readonly string[]>();
  for (const [name, list] of usedBy) {
    sortedUsedBy.set(name, [...new Set(list)].sort());
  }

  return { composes, foundations, usedBy: sortedUsedBy };
}

const coreUiCompositionGraph = buildCoreUiCompositionGraph(coreUiComponentRegistryRaw);

export const coreUiComponentRegistry: readonly CoreUiComponentRegistration[] = coreUiComponentRegistryRaw;

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);

/**
 * 反向计算组合关系：由 composes/foundations 推导出每个 entry 被谁使用。
 * 注意：usedBy 不要手写，必须由 registry 反向计算，否则会和 composes 漂移。
 */
export function getCoreUiCompositionGraph(): CoreUiCompositionGraph {
  return coreUiCompositionGraph;
}
