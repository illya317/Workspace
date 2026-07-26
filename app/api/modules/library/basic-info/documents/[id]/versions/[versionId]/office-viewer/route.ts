import { z } from "zod";

import { renderLibraryOfficeViewerResponse } from "@workspace/library/server/office-preview";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  versionId: z.coerce.number().int().positive(),
});

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "Invalid document or version id",
  buildCommand: ({ params, request, user }) => okCommand({
    documentId: params.id,
    versionId: params.versionId,
    userId: user.userId,
    request,
  }),
  action: renderLibraryOfficeViewerResponse,
});
