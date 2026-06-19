import type { CoreUiComponentKind } from "@workspace/core/ui/component-registry";

export interface CoreUiRegistryUsageRow {
  name: string;
  kind: CoreUiComponentKind;
  kindLabel: string;
  kindDescription: string;
  description: string;
  example: string;
  includedComponents: string[];
  usageFiles: string[];
}
