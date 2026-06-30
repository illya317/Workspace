import { z } from "zod";
import { updatePermissions } from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const permissionsBodySchema = z.object({
  permissions: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    role: z.enum(["viewer", "editor", "manager"]),
  })),
});

export const PUT = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: permissionsBodySchema,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    permissions: body.permissions,
  }),
  action: (command) => updatePermissions(command),
});
