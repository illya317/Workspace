export type SqlSettingGroupKey = "connection" | "session" | "audit" | "recovery";

export type SqlSettingReviewStatus = "aligned" | "review" | "informational";

export const SQL_SETTINGS_DESKTOP_RATIO = [3, 7] as const;

export interface SqlSettingCatalogItem {
  key: string;
  label: string;
  description: string;
  currentValue: string;
  unit: string | null;
  recommendedValue: string;
  source: string;
  context: string;
  pendingRestart: boolean;
  status: SqlSettingReviewStatus;
}

export interface SqlSettingCatalogGroup {
  key: SqlSettingGroupKey;
  label: string;
  description: string;
  items: SqlSettingCatalogItem[];
}

export interface SqlSettingsCatalog {
  generatedAt: string;
  databaseName: string;
  roleName: string;
  serverVersion: string;
  transport: {
    ssl: boolean;
    protocol: string | null;
    cipher: string | null;
  };
  groups: SqlSettingCatalogGroup[];
}
