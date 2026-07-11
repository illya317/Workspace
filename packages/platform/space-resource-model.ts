import type {
  ResourceRegistration,
  SpacePermissionTargetType,
  SpaceRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core";
import {
  STANDARD_BUSINESS_SPACE_PERMISSION_TARGET_TYPES,
} from "@workspace/core";

export type SpaceParentScopeType = "department" | "committee" | "company";
export type SpaceResourceKind = SpaceRegistration["spaceResourceKind"];

export const SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE = {
  department: "space.department",
  committee: "space.committee",
  company: "space.company",
} as const satisfies Record<SpaceParentScopeType, string>;

const SPACE_PARENT_LABEL_BY_SCOPE_TYPE = {
  department: "部门空间",
  committee: "运营委员会空间",
  company: "公司空间",
} as const satisfies Record<SpaceParentScopeType, string>;

const SPACE_PARENT_SORT_ORDER_BY_SCOPE_TYPE = {
  department: 1000,
  committee: 1001,
  company: 1002,
} as const satisfies Record<SpaceParentScopeType, number>;

function isSpaceParentScopeType(value: SpacePermissionTargetType | string): value is SpaceParentScopeType {
  return value === "department" || value === "committee" || value === "company";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function getSpaceParentResourceKeyForTargetType(targetType: string | null | undefined) {
  return targetType && isSpaceParentScopeType(targetType)
    ? SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[targetType]
    : null;
}

export function getSpaceChildResourceKeyForTargetType(
  targetType: string | null | undefined,
  kind: SpaceResourceKind,
) {
  const parentKey = getSpaceParentResourceKeyForTargetType(targetType);
  return parentKey ? `${parentKey}.${kind}` : null;
}

export function getSpacePermissionTargetTypesFromRegistration(
  registration: Pick<SpaceRegistration, "targetTypes" | "permissionTargetTypes">,
) {
  const targetTypes = registration.targetTypes ?? [];
  const fallback = targetTypes.length
    ? targetTypes.filter((targetType) => targetType !== "personal")
    : STANDARD_BUSINESS_SPACE_PERMISSION_TARGET_TYPES;
  return unique([...(registration.permissionTargetTypes ?? fallback)]).filter(isSpaceParentScopeType);
}

export function deriveSpaceResourceDefsFromRegistrations(
  definitions: readonly WorkspacePackageRegistration[],
): ResourceRegistration[] {
  const registrations = definitions.flatMap((definition) => definition.spaceRegistrations ?? []);
  const scopeTypes = unique(registrations.flatMap(getSpacePermissionTargetTypesFromRegistration));
  const resources: ResourceRegistration[] = scopeTypes.map((scopeType) => ({
    key: SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[scopeType],
    name: SPACE_PARENT_LABEL_BY_SCOPE_TYPE[scopeType],
    hidden: true,
    sortOrder: SPACE_PARENT_SORT_ORDER_BY_SCOPE_TYPE[scopeType],
  }));

  const seenChildKeys = new Set<string>();
  registrations.forEach((registration, index) => {
    for (const scopeType of getSpacePermissionTargetTypesFromRegistration(registration)) {
      const childKey = getSpaceChildResourceKeyForTargetType(scopeType, registration.spaceResourceKind);
      const parentKey = SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[scopeType];
      if (!childKey || seenChildKeys.has(childKey)) continue;
      seenChildKeys.add(childKey);
      resources.push({
        key: childKey,
        name: registration.label,
        parentKey,
        hidden: true,
        sortOrder: index,
      });
    }
  });

  return resources;
}

export function getSpaceChildResourceKeysForTargetType(
  definitions: readonly WorkspacePackageRegistration[],
  targetType: string | null | undefined,
) {
  if (!targetType || !isSpaceParentScopeType(targetType)) return [];
  return unique(definitions
    .flatMap((definition) => definition.spaceRegistrations ?? [])
    .filter((registration) => getSpacePermissionTargetTypesFromRegistration(registration).includes(targetType))
    .map((registration) => getSpaceChildResourceKeyForTargetType(targetType, registration.spaceResourceKind))
    .filter((key): key is string => Boolean(key)));
}

export function getSpaceResourceKindFromEntryKind(
  definitions: readonly WorkspacePackageRegistration[],
  entryKind: string,
) {
  return definitions
    .flatMap((definition) => definition.spaceRegistrations ?? [])
    .find((registration) => registration.entryKind === entryKind)
    ?.spaceResourceKind ?? null;
}
