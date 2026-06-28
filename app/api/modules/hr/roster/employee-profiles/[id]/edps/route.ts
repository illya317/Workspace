import { updateEmployeeProfileEdps, buildHrRouteCommand } from "@workspace/hr/server";
import { routeIdParamsSchema, rowsRequestBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRWrite } from "@workspace/platform/server/auth";

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  paramsSchema: routeIdParamsSchema,
  paramsError: "员工ID无效",
  bodySchema: rowsRequestBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user }) => buildHrRouteCommand({
    employeeId: params.id,
    rows: body.rows,
    userId: user.userId,
  }),
  action: ({ employeeId, rows, userId }) => updateEmployeeProfileEdps(employeeId, rows, userId),
});
