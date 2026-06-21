import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

const WORK_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/work").fkRegistrations as FkRegistration[];

export const WORK_FK_DEFINITIONS = defineFkRegistrations(WORK_FK_REGISTRATIONS);
export const WORK_FK_REGISTRY = createFkRegistryFromRegistrations(WORK_FK_REGISTRATIONS);
