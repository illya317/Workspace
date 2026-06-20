import template from "./template.json";
import type { RegistryBrowserItem, RegistryBrowserLayer, RegistryBrowserLayerKey } from "./types";

interface TemplateGroup {
  key: RegistryBrowserLayerKey;
  label: string;
  description: string;
  components: string[];
}

export const registryBrowserLayers: RegistryBrowserLayer[] = (template.groups as TemplateGroup[]).map((group) => ({
  key: group.key,
  label: group.label,
  description: group.description,
  componentNames: new Set(group.components),
}));

export function getRegistryBrowserLayer(item: RegistryBrowserItem): RegistryBrowserLayerKey {
  return registryBrowserLayers.find((layer) => layer.componentNames.has(item.name))?.key ?? "compound";
}
