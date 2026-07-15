import { serviceError } from "@workspace/platform/server/api";
import {
  listWorkOkrControlPolicies,
  updateWorkOkrControlSettings,
} from "./work-okr-control-admin";
import {
  validateWorkOkrSettingsMutation,
  type WorkOkrSettingsMutationInput,
} from "./domain/work-plan-governance-validation";
import { migrateWorkPlanGovernance } from "./work-plan-governance";

export { listWorkOkrControlPolicies as listWorkOkrSettings };

export async function updateWorkOkrSettings(input: WorkOkrSettingsMutationInput) {
  const command = validateWorkOkrSettingsMutation(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  return command.data.kind === "control_settings"
    ? updateWorkOkrControlSettings(command.data.input)
    : migrateWorkPlanGovernance(command.data.migration);
}
