import { z } from "zod";

import { executeListLibraryDocumentsCommand } from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const documentsQuerySchema = z.object({
  categoryCode: z.string().optional(),
  directoryPath: z.string().optional(),
  status: z.string().optional(),
  origin: z.string().optional(),
  confidentialityLevel: z.coerce.number().int().optional(),
  keyword: z.string().optional(),
  docId: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
});

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  querySchema: documentsQuerySchema,
  buildCommand: ({ query, user }) => okCommand({ ...query, userId: user.userId }),
  action: executeListLibraryDocumentsCommand,
});
