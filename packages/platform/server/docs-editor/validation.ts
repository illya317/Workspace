import { z } from "zod";
import type {
  CreateDocumentTemplateCommand,
  SaveDocumentTemplateDraftCommand,
} from "./types";

export const docsEditorSpaceQuerySchema = z.object({
  spaceId: z.coerce.number().int().positive().optional(),
  status: z.enum(["draft", "reviewing", "published", "archived"]).optional(),
  keyword: z.string().optional(),
});

export const templateParamsSchema = z.object({
  templateId: z.coerce.number().int().positive(),
});

export const createTemplateBodySchema = z.object({
  title: z.string().min(1).max(120),
  type: z.string().min(1).max(40).default("document"),
  spaceId: z.string().min(1),
  document: z.unknown(),
  fieldModel: z.unknown(),
  sourceKind: z.string().nullish(),
  sourceProductKey: z.string().nullish(),
  sourceStageKeys: z.array(z.string()).nullish(),
}) satisfies z.ZodType<CreateDocumentTemplateCommand>;

export const saveDraftBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
  type: z.string().optional().nullable(),
  document: z.unknown().optional(),
  fieldModel: z.unknown().optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
}) satisfies z.ZodType<SaveDocumentTemplateDraftCommand>;
