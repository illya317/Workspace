import { z } from "zod";
import { copyTemplate } from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const copyBodySchema = z.object({
  targetSpaceId: z.coerce.number().int().positive().optional().nullable(),
  targetDepartmentId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().optional().nullable(),
});

export const POST = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  bodySchema: copyBodySchema,
  optionalJsonBody: true,
  handler: ({ user, params, body }) => copyTemplate({
    userId: user.userId,
    templateId: params.templateId,
    ...(body || {}),
  }),
});
