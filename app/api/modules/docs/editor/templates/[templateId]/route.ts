import { z } from "zod";
import {
  deleteDraft,
  getTemplate,
  saveDraft,
} from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const templateParamsSchema = z.object({
  templateId: z.string().min(1),
});

const saveDraftBodySchema = z.object({
  title: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  document: z.unknown().optional(),
  fieldModel: z.unknown().optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
});

export const GET = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  handler: ({ user, params }) => getTemplate({
    userId: user.userId,
    templateId: params.templateId,
  }),
});

export const PUT = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  bodySchema: saveDraftBodySchema,
  handler: ({ user, params, body }) => saveDraft({
    userId: user.userId,
    templateId: params.templateId,
    ...body,
  }),
});

export const DELETE = createApiRouteHandler({
  paramsSchema: templateParamsSchema,
  handler: ({ user, params }) => deleteDraft({
    userId: user.userId,
    templateId: params.templateId,
  }),
});
