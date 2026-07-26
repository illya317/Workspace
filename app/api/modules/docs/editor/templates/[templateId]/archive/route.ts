import { z } from "zod";
import { archiveTemplate } from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const requiredVersionSchema = z.unknown().transform((value, ctx) => {
  if (value === null || value === undefined || value === "") {
    ctx.addIssue({ code: "custom", message: "缺少模板版本" });
    return z.NEVER;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    ctx.addIssue({ code: "custom", message: "模板版本无效" });
    return z.NEVER;
  }
  return parsed;
});

const archiveTemplateBodySchema = z.object({
  version: requiredVersionSchema,
});

export const POST = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: archiveTemplateBodySchema,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    version: body.version,
  }),
  action: (command) => archiveTemplate(command),
});
