export type SettingsApiTab = "catalog" | "clients" | "groups" | "notifications" | "logs";

export type OpenApiRegistrationRow = {
  key: string;
  label: string;
  description: string;
  consoleTab: string;
  runtimeParentResourceKey: string;
  resources: Array<{ key: string; label: string }>;
  scopes: Array<{ key: string; label: string; action: string }>;
  endpoints: Array<{ key: string; method: string; pathPrefix: string; scopeKey: string }>;
};

export type OpenApiEndpointRow = {
  key: string;
  label: string;
  method: string;
  pathPrefix: string;
  scopeKey: string;
  registrationKey: string;
};

export type OpenApiScopeRow = {
  id: number;
  key: string;
  label: string;
  action: string;
  registrationKey: string;
};

export type OpenApiClientRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scopeKeys: string[];
};

export type OpenApiLogRow = {
  id: number;
  clientName: string | null;
  endpointKey: string;
  scopeKey: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  errorCode: string | null;
  createdAt: string;
};

export type OpenApiConsoleData = {
  registrations: OpenApiRegistrationRow[];
  endpoints: OpenApiEndpointRow[];
  scopes: OpenApiScopeRow[];
  clients: OpenApiClientRow[];
  logs: OpenApiLogRow[];
};

const SETTINGS_API_TABS: readonly SettingsApiTab[] = ["catalog", "clients", "groups", "notifications", "logs"];

export function isSettingsApiTab(value: string): value is SettingsApiTab {
  return SETTINGS_API_TABS.includes(value as SettingsApiTab);
}

export function parseSettingsApiTab(value: string | null, canAccessNotifications: boolean): SettingsApiTab {
  if (!value || !isSettingsApiTab(value)) return "catalog";
  return (value === "groups" || value === "notifications") && !canAccessNotifications ? "catalog" : value;
}

export function formatSettingsApiDate(value: string | null | undefined, empty = "未使用") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
