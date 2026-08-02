import "server-only";

import type { ModuleRegistration, SubModuleRegistration } from "@workspace/core/module-contract";
import {
  DEPLOY_UNIT_CATALOG,
  type DeployUnitCatalogDependency,
  type DeployUnitCatalogEntry,
} from "@workspace/platform/deploy-unit-catalog";
import {
  getResourceRuntimeState,
} from "@workspace/platform/effective-module-registry";
import { registeredModuleDefinitions } from "@workspace/platform/module-registry";
import {
  getDynamicModuleRuntimeOverrides,
} from "@workspace/platform/module-overrides";
import { RESOURCE_DEFS } from "@workspace/platform/resources";
import { readSourceCodeAnalysisSnapshot } from "@workspace/platform/server/source-code-analysis";
import {
  preloadModuleRuntimeOverrides,
  readPersistedModuleRuntimeOverrides,
  writePersistedModuleRuntimeOverrides,
} from "@workspace/platform/server/module-runtime-overrides";

export { preloadModuleRuntimeOverrides };

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

export interface ModuleManagementDeployUnit {
  id: string;
  kind: "business-l1" | "headless-runtime" | "platform-l1" | "workspace-shell";
  maturity: "active" | "candidate" | "planned";
  moduleKeys: string[];
  moduleLabels: string[];
  runtimeDependencies: Array<{
    unitId: string;
    requirement: "required" | "optional";
    protocol: "gateway-http" | "signed-internal-rpc";
    reason: string;
  }>;
  productionState: {
    availability: "unavailable";
    ready: null;
    gatewayActive: null;
    activeSlot: null;
    version: null;
  };
}

function statusOf(input: { enabled?: boolean; hidden?: boolean }): ModuleManagementStatus {
  if (input.enabled === false) return "disabled";
  if (input.hidden) return "hidden";
  return "enabled";
}

function getModuleResourceKeys() {
  const keys = new Set<string>();
  for (const definition of registeredModuleDefinitions) {
    const moduleDef: ModuleRegistration | undefined = definition.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    keys.add(moduleDef.resourceKey);
    for (const child of moduleDef.children ?? []) keys.add(child.resourceKey);
  }
  return keys;
}

export function listModuleManagement() {
  const moduleResourceKeys = new Set<string>();
  const modules: ModuleManagementNode[] = [];

  for (const definition of registeredModuleDefinitions) {
    const moduleDef: ModuleRegistration | undefined = definition.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    const moduleResourceKey = moduleDef.resourceKey;
    moduleResourceKeys.add(moduleResourceKey);
    const state = getResourceRuntimeState(moduleResourceKey);
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
        parentResourceKey: moduleResourceKey,
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
      resourceKey: moduleResourceKey,
      apiPrefixes: [],
      noApiReason: children.length > 0 ? "L1 由子模块 API contract 组成" : null,
      noPageReason: moduleDef.noPageReason ?? null,
      status: statusOf(state),
      hidden: state.hidden,
      enabled: state.enabled,
      disabledReason: state.disabledReason ?? null,
      overrideKey: moduleResourceKey,
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

  const deployUnits: ModuleManagementDeployUnit[] = DEPLOY_UNIT_CATALOG.map((unit: DeployUnitCatalogEntry) => {
    const ownedModules = modules.filter((module) => unit.registryPackages.includes(module.packageName));
    return {
      id: unit.id,
      kind: unit.kind,
      maturity: unit.maturity,
      moduleKeys: ownedModules.map((module) => module.key),
      moduleLabels: ownedModules.map((module) => module.label),
      runtimeDependencies: unit.runtimeDependencies.map((dependency: DeployUnitCatalogDependency) => ({ ...dependency })),
      productionState: {
        availability: "unavailable",
        ready: null,
        gatewayActive: null,
        activeSlot: null,
        version: null,
      },
    };
  });

  return {
    rule: "模块开关使用 resourceKey 作为运行态键；关闭 L1/L2 会同时影响页面入口、API guard 和 resource 权限判断。",
    modules,
    auxiliaryResources,
    deployUnits,
    sourceCodeAnalysis: readSourceCodeAnalysisSnapshot(),
  };
}

export async function setModuleRuntimeEnabled(resourceKey: string, enabled: boolean) {
  const moduleResourceKeys = getModuleResourceKeys();
  if (!moduleResourceKeys.has(resourceKey)) {
    throw new Error(`MODULE_RUNTIME_RESOURCE_NOT_FOUND:${resourceKey}`);
  }

  const overrides = {
    ...getDynamicModuleRuntimeOverrides(),
    ...(await readPersistedModuleRuntimeOverrides()),
  };
  const nextOverride = { ...(overrides[resourceKey] ?? {}), enabled };
  if (enabled) delete nextOverride.disabledReason;
  if (!enabled && !nextOverride.disabledReason) nextOverride.disabledReason = "模块已在后台关闭";
  overrides[resourceKey] = nextOverride;
  await writePersistedModuleRuntimeOverrides(overrides);

  return listModuleManagement();
}
