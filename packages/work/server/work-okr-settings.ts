import { serviceError } from "@workspace/platform/server/api";
import {
  listWorkOkrControlPolicies,
  updateWorkOkrControlSettings,
} from "./work-okr-control-admin";
import {
  validateWorkOkrSettingsMutation,
  type WorkOkrSettingsMutationInput,
} from "./domain/work-plan-governance-validation";

export { listWorkOkrControlPolicies as listWorkOkrSettings };

export async function updateWorkOkrSettings(input: WorkOkrSettingsMutationInput) {
  const command = validateWorkOkrSettingsMutation(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  return updateWorkOkrControlSettings(command.data.input);
}
