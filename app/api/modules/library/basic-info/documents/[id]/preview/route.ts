import { executePreviewLibraryDocumentCommand } from "@workspace/library/server/preview-route-command";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, request, user }) => okCommand({ id: params.id, userId: user.userId, request }),
  action: executePreviewLibraryDocumentCommand,
});
