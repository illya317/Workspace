import { z } from "zod";

// Transport schemas only; business rules remain in the document-template domain validators.
import type {
  CreateDocumentTemplateCommand,
  SaveDocumentTemplateDraftCommand,
} from "./types";

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

export const docsEditorSpaceQuerySchema = z.object({
  spaceId: z.coerce.number().int().positive().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  keyword: z.string().optional(),
});

export const templateParamsSchema = z.object({
  templateId: z.coerce.number().int().positive(),
});

export const createTemplateBodySchema = z.object({
  title: z.string().min(1).max(120),
  type: z.string().min(1).max(40).default("document"),
  spaceId: z.string().min(1),
  document: jsonObjectSchema,
  fieldModel: jsonObjectSchema,
  sourceKind: z.string().nullish(),
  sourceProductKey: z.string().nullish(),
  sourceStageKeys: z.array(z.string()).nullish(),
}) satisfies z.ZodType<CreateDocumentTemplateCommand>;

export const saveDraftBodySchema = z.object({
  version: requiredVersionSchema,
  title: z.string().min(1).max(120).optional(),
  type: z.string().optional().nullable(),
  document: jsonObjectSchema.optional(),
  fieldModel: jsonObjectSchema.optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
}) satisfies z.ZodType<SaveDocumentTemplateDraftCommand>;
