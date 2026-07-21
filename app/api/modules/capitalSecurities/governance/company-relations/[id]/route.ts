import { deleteCompanyRelation } from "@workspace/capital-securities/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  buildCommand: ({ params, request, user }) => okCommand({
    userId: user.userId,
    id: params.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deleteCompanyRelation,
});
