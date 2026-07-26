import { z } from "zod";

import {
  buildSearchLibraryDocumentSetRouteCommand,
  executeSearchLibraryDocumentSetCommand,
} from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const searchQuerySchema = z.object({
  query: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const GET = createCommandRoute({
  querySchema: searchQuerySchema,
  queryError: "Invalid Library search query",
  buildCommand: ({ query, user }) => buildSearchLibraryDocumentSetRouteCommand({ ...query, userId: user.userId }),
  action: executeSearchLibraryDocumentSetCommand,
});
