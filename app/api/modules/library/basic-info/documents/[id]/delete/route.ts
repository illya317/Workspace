import {
  buildDeleteLibraryDocumentRouteCommand,
  executeDeleteLibraryDocumentCommand,
} from "@workspace/library/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "资料编号无效",
  buildCommand: ({ params, user }) => buildDeleteLibraryDocumentRouteCommand({ id: params.id, userId: user.userId }),
  action: executeDeleteLibraryDocumentCommand,
});
