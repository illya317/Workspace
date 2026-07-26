import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import { createRelationCatalogFromRegistrations } from "@workspace/platform/server/relation-targets";

const ADMINISTRATION_RELATION_REGISTRATIONS =
  getRegisteredModuleDefinition("@workspace/administration").relationRegistrations ?? [];

export const ADMINISTRATION_FK_REGISTRY = createRelationCatalogFromRegistrations(
  ADMINISTRATION_RELATION_REGISTRATIONS,
);
