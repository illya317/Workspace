import { z } from "zod";

import { executeLibraryPathFileCommand } from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const libraryPathParamsSchema = z.object({
  path: z.array(z.string()).min(1),
});

export const GET = createCommandRoute({
  paramsSchema: libraryPathParamsSchema,
  buildCommand: ({ params, user }) => okCommand({ path: params.path, userId: user.userId }),
  action: executeLibraryPathFileCommand,
});
