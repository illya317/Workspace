import { z } from "zod";
import {
  deleteDraft,
  executeSaveDocsEditorTemplate,
  getTemplate,
} from "@workspace/docs/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const jsonObjectSchema = z.custom<Record<string, unknown>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  "必须是 JSON 对象",
);

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

const saveDraftBodySchema = z.object({
  version: requiredVersionSchema,
  title: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  document: jsonObjectSchema.optional(),
  fieldModel: jsonObjectSchema.optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
});

export const GET = createCommandRoute({
  paramsSchema: templateParamsSchema,
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
  }),
  action: (command) => getTemplate(command),
});

export const PUT = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: saveDraftBodySchema,
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    ...body,
  }),
  action: (command) => executeSaveDocsEditorTemplate(command),
});

export const DELETE = createCommandRoute({
  paramsSchema: templateParamsSchema,
  bodySchema: z.object({ version: requiredVersionSchema }),
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
    version: body.version,
  }),
  action: (command) => deleteDraft(command),
});
