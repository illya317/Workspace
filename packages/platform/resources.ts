import type { ResourceRegistration } from "@workspace/core";
import { activeWorkspacePackages } from "./modules";
import { deriveWorkspaceResourceDefs } from "./module-registry-utils";

const DEFAULT_MAX_ROLE = "admin";

export const RESOURCE_DEFS: ResourceRegistration[] = deriveWorkspaceResourceDefs(activeWorkspacePackages);

export const RESOURCE_MAX_ROLE: Record<string, string> = Object.fromEntries(
  RESOURCE_DEFS.map((resource) => [
    resource.key,
    resource.maxRoleKey ?? DEFAULT_MAX_ROLE,
  ]),
);

export const RESOURCE_KEYS = RESOURCE_DEFS.map((resource) => resource.key);

const MODULE_RESOURCE_KEYS = new Set(
  activeWorkspacePackages.flatMap((pkg) => {
    const moduleDef = pkg.moduleDef;
    if (!moduleDef?.resourceKey) return [];
    return [moduleDef.resourceKey, ...(moduleDef.children ?? []).map((child) => child.resourceKey)];
  }),
);

export function getResourceDef(resourceKey: string): ResourceRegistration | undefined {
  return RESOURCE_DEFS.find((resource) => resource.key === resourceKey);
}

export function isCapabilityResource(resourceKey: string): boolean {
  return getResourceDef(resourceKey)?.kind === "capability";
}

export function getCapabilityOwnerKey(resourceKey: string): string | null {
  const def = getResourceDef(resourceKey);
  return def?.kind === "capability" ? def.capabilityOwnerKey ?? null : null;
}

export function isMainRbacResource(resourceKey: string): boolean {
  const def = getResourceDef(resourceKey);
  if (def?.hidden) return false;
  if (MODULE_RESOURCE_KEYS.has(resourceKey)) return true;
  return Boolean(def && !def.parentKey && def.kind !== "capability" && !def.hidden);
}
