import {
  buildHrRouteCommand,
  deleteDepartment,
  executeUpdateDepartmentWithWorkflowGuard,
  organizationStructureLifecycleMetaFromRequest,
} from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ request, user, params, body }) => buildHrRouteCommand({
    userId: user.userId,
    id: params.id,
    field: body.field,
    value: body.value,
    lifecycle: organizationStructureLifecycleMetaFromRequest(request, {
      expectedSequence: readRequestExpectedVersion(request) ?? body.version,
      ...(body.lifecycle && typeof body.lifecycle === "object" ? body.lifecycle as Record<string, unknown> : {}),
    }),
  }),
  action: ({ userId, id, field, value, lifecycle }) => executeUpdateDepartmentWithWorkflowGuard({
    userId,
    body: { id, [field]: value, lifecycle },
  }),
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ request, user, params }) => buildHrRouteCommand({
    userId: user.userId,
    id: params.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deleteDepartment,
});
