import { executeQcConfigOverviewCommand } from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: executeQcConfigOverviewCommand,
});
