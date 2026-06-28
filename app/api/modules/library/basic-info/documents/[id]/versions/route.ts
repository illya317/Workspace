import { z } from "zod";

import { executeLibraryDocumentVersionsCommand } from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const documentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: documentParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeLibraryDocumentVersionsCommand,
});
