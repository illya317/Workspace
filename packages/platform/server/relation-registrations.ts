import { activeModuleDefinitions } from "../effective-module-registry";
import { createRelationCatalog } from "./relation-registry";
import {
  createRelationCatalogFromRegistrations,
  relationMetadataFromRegistration,
  type RelationRegistration,
} from "./relation-targets";

export function getRegisteredRelationRegistrations(): RelationRegistration[] {
  const registrations: RelationRegistration[] = [];
  for (const definition of activeModuleDefinitions) {
    registrations.push(...(definition.relationRegistrations ?? []));
  }
  return registrations;
}

export const WORKSPACE_RELATION_REGISTRY = createRelationCatalogFromRegistrations(
  getRegisteredRelationRegistrations().filter((registration) => registration.usage !== "governance"),
);

/** Complete metadata catalog used by mutation governance; unlike the selector registry it includes governance-only relations. */
export const WORKSPACE_RELATION_CATALOG = createRelationCatalog(
  getRegisteredRelationRegistrations().map(relationMetadataFromRegistration),
);

export const getRegisteredFkRegistrations = getRegisteredRelationRegistrations;
export const WORKSPACE_FK_REGISTRY = WORKSPACE_RELATION_REGISTRY;
