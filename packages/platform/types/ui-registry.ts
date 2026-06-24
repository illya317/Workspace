import type { CoreUiComponentKind, CoreUiComponentTier } from "@workspace/core/ui/component-registry";

export interface CoreUiRegistryUsageRow {
  name: string;
  tier: CoreUiComponentTier;
  tierLabel: string;
  tierDescription: string;
  kind: CoreUiComponentKind;
  kindLabel: string;
  kindDescription: string;
  description: string;
  example: string;
  includedComponents: string[];
  foundationComponents: string[];
  usageFiles: string[];
}
