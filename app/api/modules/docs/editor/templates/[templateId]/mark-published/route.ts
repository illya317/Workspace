import { z } from "zod";
import { markPublished } from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const markPublishedBodySchema = z.object({
  official: z.boolean().optional().nullable(),
});

export const POST = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: markPublishedBodySchema,
  optionalJsonBody: true,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    official: body?.official,
  }),
  action: (command) => markPublished(command),
});
