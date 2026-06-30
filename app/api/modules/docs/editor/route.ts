import { z } from "zod";
import {
  getEditorBootstrap,
  saveDraft,
} from "@workspace/platform/server/docs-editor";
import { createApiRouteHandler } from "@workspace/platform/server/api-route";

const optionalText = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  },
  z.string().optional(),
);

const listQuerySchema = z.object({
  spaceId: z.string().optional(),
  status: z.enum(["draft", "reviewing", "published", "archived"]).optional(),
  keyword: optionalText,
});

const saveDraftBodySchema = z.object({
  spaceId: z.coerce.number().int().positive().optional().nullable(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  spaceKind: z.enum(["personal", "department"]).optional().nullable(),
  title: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  document: z.unknown().optional(),
  fieldModel: z.unknown().optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
});

export const GET = createApiRouteHandler({
  querySchema: listQuerySchema,
  handler: ({ user, query }) => getEditorBootstrap({
    userId: user.userId,
    spaceId: query.spaceId,
    status: query.status,
    keyword: query.keyword,
  }),
});

export const POST = createApiRouteHandler({
  bodySchema: saveDraftBodySchema,
  handler: ({ user, body }) => saveDraft({
    userId: user.userId,
    ...body,
  }),
});
