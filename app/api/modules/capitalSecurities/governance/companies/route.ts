import { z } from "zod";
import { createCompany, listCompanies, updateCompany } from "@workspace/capital-securities/server";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";

const querySchema = z.object({
  keyword: z.string().catch(""),
  active: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(100),
}).passthrough();

const companyBodySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().nonnegative().optional(),
  partyVersion: z.coerce.number().int().nonnegative().optional(),
  legalFactRevision: z.coerce.number().int().nonnegative().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  currencyId: z.coerce.number().int().positive(),
  isConsolidationParent: z.boolean(),
  description: z.string().max(500).nullable().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema,
  buildCommand: ({ query }) => okCommand({
    keyword: query.keyword,
    activeOnly: query.active === "1",
    page: query.page,
    pageSize: query.pageSize,
  }),
  action: listCompanies,
});

export const POST = createCommandRoute({
  bodySchema: companyBodySchema,
  buildCommand: ({ body, user, request }) => okCommand({
    userId: user.userId,
    idempotencyKey: directCommandId(request),
    body,
  }),
  action: createCompany,
});

export const PUT = createCommandRoute({
  bodySchema: companyBodySchema.extend({
    id: z.coerce.number().int().positive(),
    version: z.coerce.number().int().nonnegative(),
    partyVersion: z.coerce.number().int().nonnegative(),
    legalFactRevision: z.coerce.number().int().nonnegative(),
  }),
  buildCommand: ({ body, user, request }) => okCommand({
    userId: user.userId,
    idempotencyKey: directCommandId(request),
    body,
  }),
  action: updateCompany,
});
