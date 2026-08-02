import "server-only";

import { clearResourceRuntimeStateCache } from "../effective-module-registry";
import {
  setDynamicModuleRuntimeOverrides,
  type ModuleRuntimeOverrideMap,
} from "../module-overrides";
import { prisma } from "./prisma";

const MODULE_RUNTIME_OVERRIDES_KEY = "moduleRuntimeOverrides";
let preloadPromise: Promise<void> | null = null;

function compactOverrides(overrides: ModuleRuntimeOverrideMap): ModuleRuntimeOverrideMap {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, override]) => Object.keys(override).length > 0),
  );
}

export async function readPersistedModuleRuntimeOverrides(): Promise<ModuleRuntimeOverrideMap> {
  const row = await prisma.systemConfig.findUnique({ where: { key: MODULE_RUNTIME_OVERRIDES_KEY } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as ModuleRuntimeOverrideMap
      : {};
  } catch {
    return {};
  }
}

/** Load persisted runtime state before the Node server begins accepting requests. */
export function preloadModuleRuntimeOverrides() {
  if (!preloadPromise) {
    preloadPromise = readPersistedModuleRuntimeOverrides().then((overrides) => {
      setDynamicModuleRuntimeOverrides(overrides);
      clearResourceRuntimeStateCache();
    }).catch((error) => {
      preloadPromise = null;
      throw error;
    });
  }
  return preloadPromise;
}

export async function writePersistedModuleRuntimeOverrides(overrides: ModuleRuntimeOverrideMap) {
  const value = JSON.stringify(compactOverrides(overrides));
  await prisma.systemConfig.upsert({
    where: { key: MODULE_RUNTIME_OVERRIDES_KEY },
    update: { value },
    create: { key: MODULE_RUNTIME_OVERRIDES_KEY, value },
  });
  setDynamicModuleRuntimeOverrides(JSON.parse(value) as ModuleRuntimeOverrideMap);
  clearResourceRuntimeStateCache();
}
