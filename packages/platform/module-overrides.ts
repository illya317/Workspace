import type { ResourceRegistration } from "@workspace/core";

export interface ModuleRuntimeOverride {
  enabled?: boolean;
  hidden?: boolean;
  label?: string;
  desc?: string;
  disabledReason?: string;
}

export type ModuleRuntimeOverrideMap = Record<string, ModuleRuntimeOverride>;

const STATIC_MODULE_RUNTIME_OVERRIDES = {
  "work.projects": {
    label: "项目管理",
  },
} satisfies ModuleRuntimeOverrideMap;

let dynamicModuleRuntimeOverrides: ModuleRuntimeOverrideMap | null = null;

function getDatabasePath() {
  const databaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL?.trim() : undefined;
  if (!databaseUrl?.startsWith("file:")) return null;
  const dbPath = databaseUrl.slice("file:".length).replace(/^"|"$/g, "");
  return dbPath.startsWith("/") ? dbPath : null;
}

function loadDynamicOverridesFromDatabase(): ModuleRuntimeOverrideMap {
  if (typeof window !== "undefined") return {};
  const dbPath = getDatabasePath();
  if (!dbPath) return {};
  try {
    const getBuiltinModule = (process as unknown as { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
    if (!getBuiltinModule) return {};
    const { createRequire } = getBuiltinModule("module") as { createRequire: (url: string) => NodeRequire };
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db.prepare("select value from SystemConfig where key = ?").get("moduleRuntimeOverrides") as { value?: string } | undefined;
    db.close();
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ModuleRuntimeOverrideMap
      : {};
  } catch {
    return {};
  }
}

export function getDynamicModuleRuntimeOverrides(): ModuleRuntimeOverrideMap {
  if (!dynamicModuleRuntimeOverrides) {
    dynamicModuleRuntimeOverrides = loadDynamicOverridesFromDatabase();
  }
  return dynamicModuleRuntimeOverrides;
}

export function setDynamicModuleRuntimeOverrides(overrides: ModuleRuntimeOverrideMap) {
  dynamicModuleRuntimeOverrides = overrides;
}

export function getModuleRuntimeOverrides(): ModuleRuntimeOverrideMap {
  return {
    ...STATIC_MODULE_RUNTIME_OVERRIDES,
    ...getDynamicModuleRuntimeOverrides(),
  };
}

export function resourceNameFromOverride(
  resource: ResourceRegistration,
  override?: ModuleRuntimeOverride,
) {
  return override?.label ?? resource.name;
}
