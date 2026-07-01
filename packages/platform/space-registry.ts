import type { SpaceRegistration, WorkspacePackageRegistration } from "@workspace/core";
import { registeredModuleDefinitions } from "./module-registry";

export interface RegisteredSpaceDefinition extends SpaceRegistration {
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
  return {
    ...registration,
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

export function buildSpacePermissionsPath(
  registration: Pick<SpaceRegistration, "api">,
  params: SpacePermissionsPathParams,
) {
  return registration.api.permissionsPathTemplate
    .replaceAll(":targetType", encodeURIComponent(params.targetType))
    .replaceAll(":targetId", encodeURIComponent(String(params.targetId)))
    .replaceAll(":docsSpaceId", encodeURIComponent(String(params.docsSpaceId ?? "")));
}
