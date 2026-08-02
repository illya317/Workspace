import { readRequestExpectedVersion, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";
import { deleteProjectMemberAction, updateProjectMemberFieldAction } from "@workspace/work/server";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: updateFieldBodySchema,
  paramsError: "ID 无效",
  buildCommand: ({ user, params, body, request }) => okCommand({
    userId: user.userId,
    recordId: params.id,
    body,
    expectedVersion: readRequestExpectedVersion(request),
    idempotencyKey: directCommandId(request),
  }),
  action: updateProjectMemberFieldAction,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ user, params, request }) => okCommand({
    userId: user.userId,
    recordId: params.id,
    expectedVersion: readRequestExpectedVersion(request),
    idempotencyKey: directCommandId(request),
  }),
  action: deleteProjectMemberAction,
});
