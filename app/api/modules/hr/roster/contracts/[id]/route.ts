import { deleteContract, updateContractField, buildHrRouteCommand } from "@workspace/hr/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user }) => buildHrRouteCommand({
    id: params.id,
    field: body.field,
    value: body.value,
    userId: user.userId,
  }),
  action: ({ id, field, value, userId }) => updateContractField(id, field, value, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ params, user }) => buildHrRouteCommand({ id: params.id, userId: user.userId }),
  action: ({ id, userId }) => deleteContract(id, userId),
});
