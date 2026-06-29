import { executeLibraryDocumentVersionsCommand } from "@workspace/library/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: routeIdParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeLibraryDocumentVersionsCommand,
});
