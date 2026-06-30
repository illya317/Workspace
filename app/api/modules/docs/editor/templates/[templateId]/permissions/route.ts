import { z } from "zod";
import { updatePermissions } from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const permissionsBodySchema = z.object({
  permissions: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    role: z.enum(["viewer", "editor", "manager"]),
  })),
});

export const PUT = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  bodySchema: permissionsBodySchema,
  handler: ({ user, params, body }) => updatePermissions({
    userId: user.userId,
    templateId: params.templateId,
    permissions: body.permissions,
  }),
});
