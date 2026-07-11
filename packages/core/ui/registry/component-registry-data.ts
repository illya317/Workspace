import type {
  CoreUiComponentRegistration,
  CoreUiCompositionGraph,
} from "./component-registry-types";
import { core_internal_registry_entries } from "./component-registry-data-core-internal";
import { foundation_registry_entries } from "./component-registry-data-foundation";
import { foundation_extra_registry_entries } from "./component-registry-data-foundation-extra";
import { page_api_registry_entries as pageApiAM } from "./component-registry-data-page-api-a-m";
import { page_api_registry_entries as pageApiFH } from "./component-registry-data-page-api-f-h";
import { page_api_registry_entries as pageApiIM } from "./component-registry-data-page-api-i-m";
import { page_api_registry_entries as pageApiM } from "./component-registry-data-page-api-m";
import { navigation_registry_entries } from "./component-registry-data-page-api-navigation";
import { page_api_registry_entries as pageApiNZ } from "./component-registry-data-page-api-n-z";
import { page_api_registry_entries as pageApiSZ } from "./component-registry-data-page-api-s-z";
import { page_frame_registry_entries } from "./component-registry-data-frame";

export const coreUiComponentRegistryRaw = [
  ...page_frame_registry_entries,
  ...pageApiAM,
  ...pageApiFH,
  ...pageApiIM,
  ...pageApiM,
  ...navigation_registry_entries,
  ...pageApiNZ,
  ...pageApiSZ,
  ...core_internal_registry_entries,
  ...foundation_registry_entries,
  ...foundation_extra_registry_entries,
] as const satisfies readonly CoreUiComponentRegistration[];

function buildCoreUiCompositionGraph(
  registrations: readonly CoreUiComponentRegistration[],
): CoreUiCompositionGraph {
  const composes = new Map<string, readonly string[]>();
  const usedBy = new Map<string, string[]>();

  for (const registration of registrations) {
    const compositionTargets = registration.composes ?? [];

    composes.set(registration.name, compositionTargets);

    for (const target of compositionTargets) {
      const list = usedBy.get(target) ?? [];
      list.push(registration.name);
      usedBy.set(target, list);
    }
  }

  const sortedUsedBy = new Map<string, readonly string[]>();
  for (const [name, list] of usedBy) {
    sortedUsedBy.set(name, [...new Set(list)].sort());
  }

  return { composes, usedBy: sortedUsedBy };
}

const coreUiComponentRegistryEnriched = coreUiComponentRegistryRaw;

const coreUiCompositionGraph = buildCoreUiCompositionGraph(coreUiComponentRegistryEnriched);

export const coreUiComponentRegistry: readonly CoreUiComponentRegistration[] = coreUiComponentRegistryEnriched;

export const registeredCoreUiComponentNames = new Set<string>(
  coreUiComponentRegistry.map((component) => component.name),
);

/**
 * 反向计算组合关系：由 composes 推导出每个 entry 被谁使用。
 * 注意：usedBy 不要手写，必须由 registry 反向计算，否则会和 composes 漂移。
 */
export function getCoreUiCompositionGraph(): CoreUiCompositionGraph {
  return coreUiCompositionGraph;
}
