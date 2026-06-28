export interface CoreUiRegistryUsageRow {
  name: string;
  category?: string;
  subcategory?: string;
  role?: string;
  description: string;
  includedComponents: string[];
  usedBy: string[];
  usageFiles: string[];
}
