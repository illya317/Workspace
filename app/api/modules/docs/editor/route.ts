import { z } from "zod";
import {
  getEditorBootstrap,
  saveDraft,
} from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const optionalText = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  },
  z.string().optional(),
);

const listQuerySchema = z.object({
  spaceId: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  keyword: optionalText,
});

const saveDraftBodySchema = z.object({
  spaceId: z.coerce.number().int().positive().optional().nullable(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  spaceKind: z.enum(["personal", "company", "department"]).optional().nullable(),
  title: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  document: z.unknown().optional(),
  fieldModel: z.unknown().optional(),
  sourceKind: z.string().optional().nullable(),
  sourceProductKey: z.string().optional().nullable(),
  sourceStageKeys: z.array(z.string()).optional().nullable(),
});

export const GET = createCommandRoute({
  querySchema: listQuerySchema,
  buildCommand: ({ user, query }) => okCommand({
    userId: user.userId,
    spaceId: query.spaceId,
    status: query.status,
    keyword: query.keyword,
  }),
  action: (command) => getEditorBootstrap(command),
});

export const POST = createCommandRoute({
  bodySchema: saveDraftBodySchema,
  buildCommand: ({ user, body }) => okCommand({
    userId: user.userId,
    ...body,
  }),
  action: (command) => saveDraft(command),
});
