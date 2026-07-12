import {
  buildDeleteLibraryDirectoryRouteCommand,
  executeDeleteLibraryDirectoryCommand,
} from "@workspace/library/server/route-commands";
import { LibraryDirectoryDeleteSchema } from "@workspace/library/server/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const POST = createCommandRoute({
  bodySchema: LibraryDirectoryDeleteSchema,
  buildCommand: ({ body, user }) => buildDeleteLibraryDirectoryRouteCommand({ body, userId: user.userId }),
  action: executeDeleteLibraryDirectoryCommand,
});
