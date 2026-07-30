export type SqlSettingGroupKey = "credentials" | "connection" | "session" | "audit" | "recovery";

export type SqlSettingReviewStatus = "aligned" | "review" | "informational";

export type SqlSettingManagementMode = "runtime-setting" | "password-rotation" | "host-operation" | "read-only";

export type SqlSettingOperationStatus = "pending" | "running" | "succeeded" | "failed" | "reconciliation_required";

export const SQL_SETTINGS_DESKTOP_RATIO = [3, 7] as const;

export interface SqlSettingCatalogItem {
  key: string;
  label: string;
  description: string;
  currentValue: string;
  currentValueMs: number | null;
  unit: string | null;
  recommendedValue: string;
  source: string;
  context: string;
  pendingRestart: boolean;
  status: SqlSettingReviewStatus;
  managementMode: SqlSettingManagementMode;
  options: Array<{ value: string; label: string }>;
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
  operations: SqlSettingOperation[];
}

export interface SqlSettingOperation {
  id: string;
  operation: "set-runtime-setting" | "rotate-runtime-password";
  status: SqlSettingOperationStatus;
  settingKey: string | null;
  requestedValue: string | null;
  expectedCurrentValueMs: number | null;
  reason: string;
  requestedByUserId: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
}

export type SqlSettingOperationInput =
  | {
      operation: "set-runtime-setting";
      settingKey: string;
      value: string;
      expectedCurrentValueMs: number;
      reason: string;
    }
  | {
      operation: "rotate-runtime-password";
      reason: string;
      confirmation: string;
    };
