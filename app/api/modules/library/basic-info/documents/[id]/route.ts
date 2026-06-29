import { z } from "zod";

import {
  executeArchiveLibraryDocumentCommand,
  executeGetLibraryDocumentCommand,
  executeUpdateLibraryDocumentCommand,
} from "@workspace/library/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkLibraryAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const documentPatchBodySchema = z.unknown();

export const GET = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: routeIdParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeGetLibraryDocumentCommand,
});

export const PATCH = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: routeIdParamsSchema,
  bodySchema: documentPatchBodySchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, body, user }) => okCommand({ id: params.id, body, userId: user.userId }),
  action: executeUpdateLibraryDocumentCommand,
});

export const DELETE = createCommandRoute({
  access: checkLibraryAccess,
  paramsSchema: routeIdParamsSchema,
  paramsError: "Invalid id",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: executeArchiveLibraryDocumentCommand,
});
