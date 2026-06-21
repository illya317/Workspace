import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

const HR_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/hr").fkRegistrations as FkRegistration[];

export const HR_FK_DEFINITIONS = defineFkRegistrations(HR_FK_REGISTRATIONS);
export const HR_FK_REGISTRY = createFkRegistryFromRegistrations(HR_FK_REGISTRATIONS);
