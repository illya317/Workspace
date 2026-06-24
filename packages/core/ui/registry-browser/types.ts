import type { CoreUiComponentTier } from "@workspace/core/ui/component-registry";

export interface RegistryBrowserItem {
  name: string;
  tier: CoreUiComponentTier;
  tierLabel: string;
  tierDescription: string;
  kind: string;
  kindLabel: string;
  kindDescription: string;
  description: string;
  example: string;
  includedComponents: string[];
  foundationComponents: string[];
  usedBy: string[];
  usageFiles: string[];
}

export type RegistryBrowserLayerKey = CoreUiComponentTier;

export interface RegistryBrowserLayer {
  key: RegistryBrowserLayerKey;
  label: string;
  description: string;
}

export interface RegistryBrowserCardProps {
  title: string;
  subtitle?: string;
  items: RegistryBrowserItem[];
  emptyText?: string;
}

export interface RegistryBrowserGroup {
  kind: string;
  label: string;
  description: string;
  items: RegistryBrowserItem[];
}
