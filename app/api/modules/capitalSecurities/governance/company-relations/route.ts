import { z } from "zod";
import {
  createCompanyRelation,
  listCompanyRelations,
  updateCompanyRelation,
} from "@workspace/capital-securities/server";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const querySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(100),
}).passthrough();

const relationBodySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().nonnegative().optional(),
  parentId: z.coerce.number().int().positive(),
  childId: z.coerce.number().int().positive(),
  shareRatio: z.union([z.coerce.number().min(0).max(1), z.literal(""), z.null()]).optional(),
  isConsolidated: z.boolean().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listCompanyRelations,
});

export const POST = createCommandRoute({
  bodySchema: relationBodySchema,
  buildCommand: ({ body, user }) => okCommand({ userId: user.userId, body }),
  action: createCompanyRelation,
});

export const PUT = createCommandRoute({
  bodySchema: relationBodySchema.extend({
    id: z.coerce.number().int().positive(),
    version: z.coerce.number().int().nonnegative(),
  }),
  buildCommand: ({ body, user }) => okCommand({ userId: user.userId, body }),
  action: updateCompanyRelation,
});
