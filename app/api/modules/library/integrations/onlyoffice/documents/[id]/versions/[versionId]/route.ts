import { z } from "zod";

import {
  serveLibraryOfficeSourceResponse,
  verifyLibraryOfficeSourceToken,
} from "@workspace/library/server/office-preview";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  versionId: z.coerce.number().int().positive(),
});
const querySchema = z.object({ token: z.string().min(32).max(4096) });

export const GET = createInternalApiRoute({
  paramsSchema,
  paramsError: "Invalid document or version id",
  querySchema,
  queryError: "Invalid source token",
  authorize: async ({ params, query }) => {
    const claims = await verifyLibraryOfficeSourceToken(query.token);
    return claims?.documentId === params.id && claims.versionId === params.versionId;
  },
  authorizeError: "Invalid or expired source token",
  handler: ({ params, query }) => serveLibraryOfficeSourceResponse({
    documentId: params.id,
    versionId: params.versionId,
    token: query.token,
  }),
});
