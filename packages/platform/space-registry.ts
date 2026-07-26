import {
  STANDARD_BUSINESS_SPACE_PERMISSION_TARGET_TYPES,
  STANDARD_BUSINESS_SPACE_TARGET_TYPES,
  type SpacePermissionTargetType,
  type SpaceRegistration,
  type WorkspacePackageRegistration,
} from "@workspace/core/module-contract";
import { registeredModuleDefinitions } from "./module-registry";

const STANDARD_BUSINESS_SPACE_NATURAL_MANAGER_SOURCES = {
  personal: ["当前用户本人"],
  department: ["Department.managerPositionId 对应岗位的在职人员"],
  committee: ["租户配置的委员会负责人岗位"],
  company: ["租户配置的授权管理岗位"],
} as const satisfies Partial<Record<SpacePermissionTargetType, readonly string[]>>;

export interface RegisteredSpaceDefinition extends Omit<SpaceRegistration, "targetTypes" | "permissionTargetTypes" | "naturalManagerSources"> {
  targetTypes: SpacePermissionTargetType[];
  permissionTargetTypes: SpacePermissionTargetType[];
  naturalManagerSources: Partial<Record<SpacePermissionTargetType, string[]>>;
  ownerPackage: string;
  ownerLayer: WorkspacePackageRegistration["layer"];
  ownerModuleKey: string | null;
}

export interface SpacePermissionsPathParams {
  targetType: string;
  targetId: number;
  docsSpaceId?: string | number | null;
}

function withOwner(definition: WorkspacePackageRegistration, registration: SpaceRegistration): RegisteredSpaceDefinition {
  const targetTypes = getSpaceTargetTypes(registration);
  const permissionTargetTypes = getSpacePermissionTargetTypes(registration);
  return {
    ...registration,
    targetTypes,
    permissionTargetTypes,
    naturalManagerSources: {
      ...Object.fromEntries(
        Object.entries(STANDARD_BUSINESS_SPACE_NATURAL_MANAGER_SOURCES).map(([key, value]) => [key, [...value]]),
      ),
      ...registration.naturalManagerSources,
    },
    ownerPackage: definition.packageName,
    ownerLayer: definition.layer,
    ownerModuleKey: definition.moduleDef?.key ?? null,
  };
}

function buildSpaceRegistry(definitions: readonly WorkspacePackageRegistration[]) {
  return definitions.flatMap((definition) =>
    (definition.spaceRegistrations ?? []).map((registration) => withOwner(definition, registration)),
  );
}

function validateSpaceRegistry(registrations: readonly RegisteredSpaceDefinition[]) {
  const seen = new Set<string>();
  for (const registration of registrations) {
    if (seen.has(registration.key)) throw new Error(`Duplicate space registration key: ${registration.key}`);
    seen.add(registration.key);
    const targetTypes = new Set(getSpaceTargetTypes(registration));
    for (const targetType of registration.permissionTargetTypes ?? []) {
      if (!targetTypes.has(targetType)) {
        throw new Error(`Space permission target type must be listed in targetTypes: ${registration.key}:${targetType}`);
      }
    }
    if (!registration.api.permissionsPathTemplate.startsWith("/api/")) {
      throw new Error(`Space permission API path must start with /api: ${registration.key}`);
    }
    if (registration.app.defaultLevel !== "L3") {
      throw new Error(`Space registration must default to L3 app level: ${registration.key}`);
    }
  }
}

export const registeredSpaceDefinitions = buildSpaceRegistry(registeredModuleDefinitions);

validateSpaceRegistry(registeredSpaceDefinitions);

export function getRegisteredSpaceDefinitions() {
  return registeredSpaceDefinitions;
}

export function getRegisteredSpaceResourceKeys() {
  return Array.from(new Set(registeredSpaceDefinitions.map((definition) => definition.resourceKey)));
}

export function isRegisteredSpaceResourceKey(resourceKey: string | null | undefined) {
  if (!resourceKey) return false;
  return registeredSpaceDefinitions.some((definition) => definition.resourceKey === resourceKey);
}

export function getRegisteredSpaceDefinition(key: string) {
  return registeredSpaceDefinitions.find((definition) => definition.key === key) ?? null;
}

export function getSpaceTargetTypes(registration: Pick<SpaceRegistration, "targetTypes">) {
  return [...(registration.targetTypes ?? STANDARD_BUSINESS_SPACE_TARGET_TYPES)];
}

export function getSpacePermissionTargetTypes(
  registration: Pick<SpaceRegistration, "targetTypes" | "permissionTargetTypes">,
) {
  return [...(registration.permissionTargetTypes ?? (registration.targetTypes?.length
    ? getSpaceTargetTypes(registration).filter((targetType) => targetType !== "personal")
    : STANDARD_BUSINESS_SPACE_PERMISSION_TARGET_TYPES))];
}

export function isSpacePermissionTargetSupported(
  registration: Pick<SpaceRegistration, "targetTypes" | "permissionTargetTypes">,
  targetType: SpacePermissionTargetType | string,
) {
  return getSpacePermissionTargetTypes(registration).includes(targetType as SpacePermissionTargetType);
}

export function isSpacePermissionTargetSupportedByKey(key: string, targetType: SpacePermissionTargetType | string) {
  const registration = getRegisteredSpaceDefinition(key);
  return Boolean(registration && isSpacePermissionTargetSupported(registration, targetType));
}

export function buildSpacePermissionsPath(
  registration: Pick<SpaceRegistration, "api">,
  params: SpacePermissionsPathParams,
) {
  return registration.api.permissionsPathTemplate
    .replaceAll(":targetType", encodeURIComponent(params.targetType))
    .replaceAll(":targetId", encodeURIComponent(String(params.targetId)))
    .replaceAll(":docsSpaceId", encodeURIComponent(String(params.docsSpaceId ?? "")));
}
