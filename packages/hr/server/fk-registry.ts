import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistrationAdapters,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import { searchEdpReportToOptions } from "./edp-report-to";

const HR_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/hr").fkRegistrations as FkRegistration[];

const HR_FK_ADAPTERS: FkRegistrationAdapters = {
  "hr.edp.reportTo": {
    search: ({ keyword, params }) =>
      searchEdpReportToOptions({
        keyword,
        positionId: parseNullablePositiveId(params?.positionId, "岗位ID"),
      }),
  },
};

function parseNullablePositiveId(value: string | undefined, label: string) {
  if (!value) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label}无效`);
  return id;
}

export const HR_FK_DEFINITIONS = defineFkRegistrations(HR_FK_REGISTRATIONS, HR_FK_ADAPTERS);
export const HR_FK_REGISTRY = createFkRegistryFromRegistrations(HR_FK_REGISTRATIONS, HR_FK_ADAPTERS);
