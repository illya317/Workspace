import type { ResourceRegistration } from "@workspace/core";
import { activeWorkspacePackages } from "./modules";

const DEFAULT_MAX_ROLE = "admin";

export const RESOURCE_DEFS: ResourceRegistration[] = activeWorkspacePackages.flatMap(
  (pkg) => pkg.resourceDefs ?? [],
);

export const RESOURCE_MAX_ROLE: Record<string, string> = Object.fromEntries(
  RESOURCE_DEFS.map((resource) => [
    resource.key,
    resource.maxRoleKey ?? DEFAULT_MAX_ROLE,
  ]),
);

export const RESOURCE_KEYS = RESOURCE_DEFS.map((resource) => resource.key);

export function getResourceDef(resourceKey: string): ResourceRegistration | undefined {
  return RESOURCE_DEFS.find((resource) => resource.key === resourceKey);
}
