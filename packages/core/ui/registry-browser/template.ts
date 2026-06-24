import { coreUiComponentTierMeta } from "@workspace/core/ui/component-registry";
import type { RegistryBrowserItem, RegistryBrowserLayer, RegistryBrowserLayerKey } from "./types";

export const registryBrowserLayers: RegistryBrowserLayer[] = (
  ["primitive", "assembly", "frame"] as RegistryBrowserLayerKey[]
).map((key) => ({
  key,
  label: coreUiComponentTierMeta[key].label,
  description: coreUiComponentTierMeta[key].description,
}));

export function getRegistryBrowserLayer(item: RegistryBrowserItem): RegistryBrowserLayerKey {
  return item.tier;
}
