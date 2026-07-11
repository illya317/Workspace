import { z } from "zod";
import { executePublishDocsEditorTemplate } from "@workspace/platform/server/docs-editor";
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

const publishDraftBodySchema = z.object({
  version: requiredVersionSchema,
  title: z.string().min(1).max(120),
  type: z.string().min(1).max(40).default("document"),
  document: z.record(z.string(), z.unknown()),
  fieldModel: z.record(z.string(), z.unknown()),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
});

export const POST = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: publishDraftBodySchema,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    version: body.version,
  }),
  action: (command) => executePublishDocsEditorTemplate(command),
});
