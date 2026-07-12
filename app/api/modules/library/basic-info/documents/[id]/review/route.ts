import {
  buildReviewLibraryDocumentRouteCommand,
  executeReviewLibraryDocumentCommand,
} from "@workspace/library/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const POST = createCommandRoute({
  accessError: "没有资料导入确认权限",
  paramsSchema: routeIdParamsSchema,
  paramsError: "资料编号无效",
  buildCommand: ({ params, user }) => buildReviewLibraryDocumentRouteCommand({ id: params.id, userId: user.userId }),
  action: executeReviewLibraryDocumentCommand,
});
