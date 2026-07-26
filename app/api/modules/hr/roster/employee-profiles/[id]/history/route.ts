import { executeEmployeeProfileHistoryCommand } from "@workspace/hr/server";
import { routeStringIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: routeStringIdParamsSchema,
  buildCommand: ({ params }) => okCommand(params),
  action: executeEmployeeProfileHistoryCommand,
});
