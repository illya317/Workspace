import { z } from "zod";

import {
  buildHrRouteCommand,
  executePositionDescriptionTemplateSaveCommand,
  readPositionDescriptionTemplates,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";const updateTemplatesSchema = z.object({
  templates: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  buildCommand: () => buildHrRouteCommand({}),
  action: async () => ({ templates: await readPositionDescriptionTemplates() }),
});

export const PUT = createCommandRoute({
  bodySchema: updateTemplatesSchema,
  bodyError: "参数错误",
  buildCommand: ({ body }) => buildHrRouteCommand({
    templates: body.templates,
  }),
  action: ({ templates }) => executePositionDescriptionTemplateSaveCommand(templates),
});
