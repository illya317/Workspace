import type {
  ApiGuardRegistration,
  ModuleRegistration,
  ResourceRegistration,
  SubModuleRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core";
import { registeredModuleDefinitions } from "./module-registry";
import { deriveWorkspaceResourceDefs } from "./module-registry-utils";
import { getModuleRuntimeOverrides, type ModuleRuntimeOverride, type ModuleRuntimeOverrideMap } from "./module-overrides";

type RuntimeState = Required<Pick<ModuleRuntimeOverride, "enabled" | "hidden">> & {
  disabledReason?: string;
  label?: string;
  desc?: string;
};

const DEFAULT_DISABLED_REASON = "模块未启用";
const TARGET_RESOURCE_KEYS: Record<string, string> = {
  project: "work.projects",
};

function overrideFor(...keys: Array<string | undefined | null>) {
  const overrides: ModuleRuntimeOverrideMap = getModuleRuntimeOverrides();
  for (const key of keys) {
    if (key && overrides[key]) return overrides[key];
  }
  return undefined;
}

function normalizeState(
  override: ModuleRuntimeOverride | undefined,
  parent?: RuntimeState,
): RuntimeState {
  const parentEnabled = parent?.enabled ?? true;
  const enabled = parentEnabled && (override?.enabled ?? true);
  return {
    enabled,
    hidden: (parent?.hidden ?? false) || (override?.hidden ?? false),
    disabledReason: enabled ? undefined : override?.disabledReason ?? parent?.disabledReason ?? DEFAULT_DISABLED_REASON,
    label: override?.label,
    desc: override?.desc,
  };
}

function moduleState(moduleDef: ModuleRegistration) {
  return normalizeState(overrideFor(moduleDef.resourceKey, moduleDef.key));
}

function childState(moduleDef: ModuleRegistration, child: SubModuleRegistration) {
  return normalizeState(
    overrideFor(child.resourceKey, `${moduleDef.key}.${child.key}`, child.key),
    moduleState(moduleDef),
  );
}

function applyModuleOverride(moduleDef: ModuleRegistration): ModuleRegistration {
  const state = moduleState(moduleDef);
  return {
    ...moduleDef,
    label: state.label ?? moduleDef.label,
    desc: state.desc ?? moduleDef.desc,
    enabled: state.enabled,
    hidden: state.hidden,
    disabledReason: state.disabledReason,
    children: moduleDef.children?.map((child) => {
      const state = childState(moduleDef, child);
      return {
        ...child,
        label: state.label ?? child.label,
        desc: state.desc ?? child.desc,
        enabled: state.enabled,
        hidden: state.hidden,
        disabledReason: state.disabledReason,
      };
    }),
  };
}

const rawResourceDefs: ResourceRegistration[] = deriveWorkspaceResourceDefs(registeredModuleDefinitions);
const resourceByKey = new Map(rawResourceDefs.map((resource) => [resource.key, resource]));
const resourceRuntimeParentByKey = new Map(rawResourceDefs.map((resource) => [resource.key, resource.runtimeParentKey ?? resource.parentKey ?? null]));
const moduleByResourceKey = new Map<string, ModuleRegistration>();
const childByResourceKey = new Map<string, { moduleDef: ModuleRegistration; child: SubModuleRegistration }>();

for (const definition of registeredModuleDefinitions) {
  const moduleDef = definition.moduleDef;
  if (!moduleDef) continue;
  if (moduleDef.resourceKey) moduleByResourceKey.set(moduleDef.resourceKey, moduleDef);
  for (const child of moduleDef.children ?? []) childByResourceKey.set(child.resourceKey, { moduleDef, child });
}

const resourceStateCache = new Map<string, RuntimeState>();

export function clearResourceRuntimeStateCache() {
  resourceStateCache.clear();
}

export function getResourceRuntimeState(resourceKey: string): RuntimeState {
  const cached = resourceStateCache.get(resourceKey);
  if (cached) return cached;

  const parentKey = resourceRuntimeParentByKey.get(resourceKey) ?? null;
  const parentState = parentKey ? getResourceRuntimeState(parentKey) : undefined;
  const moduleDef = moduleByResourceKey.get(resourceKey);
  const childEntry = childByResourceKey.get(resourceKey);
  const override = overrideFor(resourceKey);
  const state = moduleDef
    ? normalizeState(overrideFor(moduleDef.resourceKey, moduleDef.key), parentState)
    : childEntry
      ? childState(childEntry.moduleDef, childEntry.child)
      : normalizeState(override, parentState);
  const resource = resourceByKey.get(resourceKey);
  const resourceEnabled = resource?.enabled ?? true;
  const mergedState = {
    ...state,
    enabled: state.enabled && resourceEnabled,
    hidden: state.hidden || resource?.hidden === true,
    disabledReason:
      state.enabled && resourceEnabled
        ? resource?.disabledReason
        : resource?.disabledReason ?? state.disabledReason,
  };

  resourceStateCache.set(resourceKey, mergedState);
  return mergedState;
}

export function isResourceEnabled(resourceKey: string) {
  return getResourceRuntimeState(resourceKey).enabled;
}

export function isResourceHidden(resourceKey: string) {
  return getResourceRuntimeState(resourceKey).hidden;
}

export function isRouteEnabled(route: string) {
  const match = findModuleByRoute(route);
  return match ? match.state.enabled : true;
}

export function findModuleByRoute(route: string) {
  const normalizedRoute = route.replace(/\/+$/g, "") || "/";
  const candidates: Array<{ resourceKey: string; state: RuntimeState; route: string }> = [];
  for (const definition of effectiveModuleDefinitions) {
    const moduleDef = definition.moduleDef;
    if (!moduleDef) continue;
    if (moduleDef.resourceKey) candidates.push({ resourceKey: moduleDef.resourceKey, state: getResourceRuntimeState(moduleDef.resourceKey), route: moduleDef.href });
    for (const child of moduleDef.children ?? []) {
      candidates.push({ resourceKey: child.resourceKey, state: getResourceRuntimeState(child.resourceKey), route: child.href });
    }
  }
  return candidates
    .filter((candidate) => normalizedRoute === candidate.route || normalizedRoute.startsWith(`${candidate.route}/`))
    .sort((left, right) => right.route.length - left.route.length)[0] ?? null;
}

export function isApiGuardEnabled(guard: ApiGuardRegistration) {
  return isResourceEnabled(guard.resourceKey);
}

function applyResourceOverride(resource: ResourceRegistration): ResourceRegistration {
  const state = getResourceRuntimeState(resource.key);
  return {
    ...resource,
    name: state.label ?? resource.name,
    enabled: state.enabled,
    hidden: state.hidden,
    disabledReason: state.disabledReason,
  };
}

function targetResourceEnabled(target: string) {
  const resourceKey = TARGET_RESOURCE_KEYS[target];
  return resourceKey ? isResourceEnabled(resourceKey) : true;
}

function toEffectiveDefinition(definition: WorkspacePackageRegistration): WorkspacePackageRegistration {
  return {
    ...definition,
    moduleDef: definition.moduleDef ? applyModuleOverride(definition.moduleDef) : undefined,
    resourceDefs: definition.resourceDefs?.map(applyResourceOverride),
  };
}

function toActiveDefinition(definition: WorkspacePackageRegistration): WorkspacePackageRegistration {
  const effective = toEffectiveDefinition(definition);
  const activeModuleDef = effective.moduleDef
    ? {
        ...effective.moduleDef,
        children: effective.moduleDef.children?.filter((child) => child.enabled !== false && !child.hidden),
      }
    : undefined;
  return {
    ...effective,
    moduleDef: activeModuleDef,
    resourceDefs: effective.resourceDefs?.filter((resource) => resource.enabled !== false),
    fkRegistrations: effective.fkRegistrations?.filter(
      (registration) => isResourceEnabled(registration.permission.resourceKey) && targetResourceEnabled(registration.target),
    ),
  };
}

export const effectiveModuleDefinitions = registeredModuleDefinitions.map(toEffectiveDefinition);

export const activeModuleDefinitions = registeredModuleDefinitions.map(toActiveDefinition);

export function getEffectiveModuleDefinition(packageName: string): WorkspacePackageRegistration {
  const definition = effectiveModuleDefinitions.find((item) => item.packageName === packageName);
  if (!definition) throw new Error(`Module package is not registered: ${packageName}`);
  return definition;
}

export function getDisabledReasonForResource(resourceKey: string) {
  const state = getResourceRuntimeState(resourceKey);
  return state.enabled ? null : state.disabledReason ?? DEFAULT_DISABLED_REASON;
}
