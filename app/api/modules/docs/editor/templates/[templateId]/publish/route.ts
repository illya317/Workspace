import { z } from "zod";
import { markPublished } from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const markPublishedBodySchema = z.object({
  official: z.boolean().optional().nullable(),
});

export const POST = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  bodySchema: markPublishedBodySchema,
  optionalJsonBody: true,
  handler: ({ user, params, body }) => markPublished({
    userId: user.userId,
    templateId: params.templateId,
    official: body?.official,
  }),
});
