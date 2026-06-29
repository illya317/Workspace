import { executeEmployeeProfileHistoryCommand } from "@workspace/hr/server";
import { routeStringIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  paramsSchema: routeStringIdParamsSchema,
  buildCommand: ({ params }) => okCommand(params),
  action: executeEmployeeProfileHistoryCommand,
});
