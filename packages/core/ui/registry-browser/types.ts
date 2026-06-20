export interface RegistryBrowserItem {
  name: string;
  kind: string;
  kindLabel: string;
  kindDescription: string;
  description: string;
  example: string;
  includedComponents: string[];
  usageFiles: string[];
}

export type RegistryBrowserLayerKey = "atomic" | "compound";

export interface RegistryBrowserLayer {
  key: RegistryBrowserLayerKey;
  label: string;
  description: string;
  componentNames: Set<string>;
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
