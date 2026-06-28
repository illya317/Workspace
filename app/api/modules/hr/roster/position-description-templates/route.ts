import { z } from "zod";

import {
  buildHrRouteCommand,
  normalizePositionDescriptionTemplates,
  readPositionDescriptionTemplates,
  writePositionDescriptionTemplates,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";

const updateTemplatesSchema = z.object({
  templates: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  buildCommand: () => buildHrRouteCommand({}),
  action: async () => ({ templates: await readPositionDescriptionTemplates() }),
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: updateTemplatesSchema,
  bodyError: "参数错误",
  buildCommand: ({ body }) => buildHrRouteCommand({
    templates: normalizePositionDescriptionTemplates(body.templates),
  }),
  action: async ({ templates }) => {
    await writePositionDescriptionTemplates(templates);
    return { success: true, templates };
  },
});
