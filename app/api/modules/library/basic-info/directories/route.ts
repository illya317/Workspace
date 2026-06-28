import { executeLibraryDirectoriesCommand } from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  buildCommand: ({ user }) => okCommand({ userId: user.userId }),
  action: executeLibraryDirectoriesCommand,
});
