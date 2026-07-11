import { activeModuleDefinitions } from "../effective-module-registry";
import {
  createFkRegistryFromRegistrations,
  type FkRegistration,
} from "./fk-targets";

export function getRegisteredFkRegistrations(): FkRegistration[] {
  const registrations: FkRegistration[] = [];
  for (const definition of activeModuleDefinitions) {
    registrations.push(...((definition.fkRegistrations ?? []) as FkRegistration[]));
  }
  return registrations;
}

export const WORKSPACE_FK_REGISTRY = createFkRegistryFromRegistrations(getRegisteredFkRegistrations());
