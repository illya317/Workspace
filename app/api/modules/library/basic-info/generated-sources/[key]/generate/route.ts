import { z } from "zod";

import {
  buildGenerateLibraryDocumentCommand,
  executeGenerateLibraryDocumentCommand,
} from "@workspace/library/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  key: z.string().trim().min(1),
});

const generateRequestSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  confidentialityLevel: z.coerce.number().int().min(0).max(4).optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "Invalid key",
  bodySchema: generateRequestSchema,
  bodyError: "title is required",
  buildCommand: ({ params, body, user }) => buildGenerateLibraryDocumentCommand({
    key: params.key,
    userId: user.userId,
    body,
  }),
  action: executeGenerateLibraryDocumentCommand,
});
