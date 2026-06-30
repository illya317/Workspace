import { z } from "zod";
import { copyTemplate } from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const copyBodySchema = z.object({
  targetSpaceId: z.coerce.number().int().positive().optional().nullable(),
  targetDepartmentId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().optional().nullable(),
});

export const POST = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: copyBodySchema,
  optionalJsonBody: true,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    ...(body || {}),
  }),
  action: (command) => copyTemplate(command),
});
