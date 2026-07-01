import { z } from "zod";
import {
  deleteDraft,
  getTemplate,
  saveDraft,
} from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const jsonObjectSchema = z.custom<Record<string, unknown>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  "必须是 JSON 对象",
);

const saveDraftBodySchema = z.object({
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
  action: (command) => saveDraft(command),
});

export const DELETE = createCommandRoute({
  paramsSchema: templateParamsSchema,
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    templateId: params.templateId,
  }),
  action: (command) => deleteDraft(command),
});
