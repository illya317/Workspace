export interface CoreUiRegistryUsageRow {
  name: string;
  category?: string;
  subcategory?: string;
  description: string;
  example: string;
  includedComponents: string[];
  usedBy: string[];
  usageFiles: string[];
}
