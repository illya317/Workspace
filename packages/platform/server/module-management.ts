import "server-only";

import type { SubModuleRegistration } from "@workspace/core";
import {
  clearResourceRuntimeStateCache,
  getResourceRuntimeState,
} from "@workspace/platform/effective-module-registry";
import { registeredModuleDefinitions } from "@workspace/platform/module-registry";
import {
  getDynamicModuleRuntimeOverrides,
  setDynamicModuleRuntimeOverrides,
  type ModuleRuntimeOverrideMap,
} from "@workspace/platform/module-overrides";
import { RESOURCE_DEFS } from "@workspace/platform/resources";
import { prisma } from "./prisma";

const MODULE_RUNTIME_OVERRIDES_KEY = "moduleRuntimeOverrides";

export type ModuleManagementStatus = "enabled" | "hidden" | "disabled";

export interface ModuleManagementNode {
  key: string;
  label: string;
  desc: string;
  level: "L1" | "L2";
  packageName: string;
  pageHref: string | null;
  resourceKey: string;
  apiPrefixes: string[];
  noApiReason: string | null;
  noPageReason: string | null;
  status: ModuleManagementStatus;
  hidden: boolean;
  enabled: boolean;
  disabledReason: string | null;
  overrideKey: string;
  parentResourceKey: string | null;
  parentEnabled: boolean | null;
  children: ModuleManagementNode[];
}

export interface ModuleManagementResource {
  key: string;
  name: string;
  kind: "capability" | "resource";
  ownerKey: string | null;
  runtimeParentKey: string | null;
  parentKey: string | null;
  status: ModuleManagementStatus;
  hidden: boolean;
  enabled: boolean;
  disabledReason: string | null;
}

function statusOf(input: { enabled?: boolean; hidden?: boolean }): ModuleManagementStatus {
  if (input.enabled === false) return "disabled";
  if (input.hidden) return "hidden";
  return "enabled";
}

function getModuleResourceKeys() {
  const keys = new Set<string>();
  for (const definition of registeredModuleDefinitions) {
    const moduleDef = definition.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    keys.add(moduleDef.resourceKey);
    for (const child of moduleDef.children ?? []) keys.add(child.resourceKey);
  }
  return keys;
}

function compactOverrides(overrides: ModuleRuntimeOverrideMap): ModuleRuntimeOverrideMap {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, override]) => Object.keys(override).length > 0),
  );
}

async function readPersistedOverrides(): Promise<ModuleRuntimeOverrideMap> {
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

async function writePersistedOverrides(overrides: ModuleRuntimeOverrideMap) {
  const value = JSON.stringify(compactOverrides(overrides));
  await prisma.systemConfig.upsert({
    where: { key: MODULE_RUNTIME_OVERRIDES_KEY },
    update: { value },
    create: { key: MODULE_RUNTIME_OVERRIDES_KEY, value },
  });
  setDynamicModuleRuntimeOverrides(JSON.parse(value) as ModuleRuntimeOverrideMap);
  clearResourceRuntimeStateCache();
}

export function listModuleManagement() {
  const moduleResourceKeys = new Set<string>();
  const modules: ModuleManagementNode[] = [];

  for (const definition of registeredModuleDefinitions) {
    const moduleDef = definition.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    moduleResourceKeys.add(moduleDef.resourceKey);
    const state = getResourceRuntimeState(moduleDef.resourceKey);
    const children = (moduleDef.children as SubModuleRegistration[] | undefined ?? []).map((child) => {
      moduleResourceKeys.add(child.resourceKey);
      const childState = getResourceRuntimeState(child.resourceKey);
      return {
        key: child.key,
        label: child.label,
        desc: child.desc,
        level: "L2" as const,
        packageName: definition.packageName,
        pageHref: child.href,
        resourceKey: child.resourceKey,
        apiPrefixes: child.apiPrefixes ?? [],
        noApiReason: child.noApiReason ?? null,
        noPageReason: null,
        status: statusOf(childState),
        hidden: childState.hidden,
        enabled: childState.enabled,
        disabledReason: childState.disabledReason ?? null,
        overrideKey: child.resourceKey,
        parentResourceKey: moduleDef.resourceKey,
        parentEnabled: state.enabled,
        children: [],
      };
    });
    modules.push({
      key: moduleDef.key,
      label: moduleDef.label,
      desc: moduleDef.desc,
      level: "L1",
      packageName: definition.packageName,
      pageHref: moduleDef.presentation === "headless" ? null : moduleDef.href,
      resourceKey: moduleDef.resourceKey,
      apiPrefixes: [],
      noApiReason: children.length > 0 ? "L1 由子模块 API contract 组成" : null,
      noPageReason: moduleDef.noPageReason ?? null,
      status: statusOf(state),
      hidden: state.hidden,
      enabled: state.enabled,
      disabledReason: state.disabledReason ?? null,
      overrideKey: moduleDef.resourceKey,
      parentResourceKey: null,
      parentEnabled: null,
      children,
    });
  }

  const auxiliaryResources: ModuleManagementResource[] = RESOURCE_DEFS
    .filter((resource) => !moduleResourceKeys.has(resource.key))
    .map((resource) => {
      const state = getResourceRuntimeState(resource.key);
      return {
        key: resource.key,
        name: resource.name,
        kind: resource.kind === "capability" ? "capability" : "resource",
        ownerKey: resource.capabilityOwnerKey ?? null,
        runtimeParentKey: resource.runtimeParentKey ?? null,
        parentKey: resource.parentKey ?? null,
        status: statusOf(state),
        hidden: state.hidden,
        enabled: state.enabled,
        disabledReason: state.disabledReason ?? null,
      };
    });

  return {
    rule: "模块开关使用 resourceKey 作为运行态键；关闭 L1/L2 会同时影响页面入口、API guard 和 resource 权限判断。",
    modules,
    auxiliaryResources,
  };
}

export async function setModuleRuntimeEnabled(resourceKey: string, enabled: boolean) {
  const moduleResourceKeys = getModuleResourceKeys();
  if (!moduleResourceKeys.has(resourceKey)) {
    throw new Error(`MODULE_RUNTIME_RESOURCE_NOT_FOUND:${resourceKey}`);
  }

  const overrides = {
    ...getDynamicModuleRuntimeOverrides(),
    ...(await readPersistedOverrides()),
  };
  const nextOverride = { ...(overrides[resourceKey] ?? {}), enabled };
  if (enabled) delete nextOverride.disabledReason;
  if (!enabled && !nextOverride.disabledReason) nextOverride.disabledReason = "模块已在后台关闭";
  overrides[resourceKey] = nextOverride;
  await writePersistedOverrides(overrides);

  return listModuleManagement();
}
