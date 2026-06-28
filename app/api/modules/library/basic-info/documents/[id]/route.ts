import { z } from "zod";

import {
  executeArchiveLibraryDocumentCommand,
  executeGetLibraryDocumentCommand,
  executeUpdateLibraryDocumentCommand,
} from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const documentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const documentPatchBodySchema = z.unknown();

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: documentParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeGetLibraryDocumentCommand,
});

export const PATCH = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: documentParamsSchema,
  bodySchema: documentPatchBodySchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, body, user }) => okCommand({ id: params.id, body, userId: user.userId }),
  action: executeUpdateLibraryDocumentCommand,
});

export const DELETE = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: documentParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeArchiveLibraryDocumentCommand,
});
