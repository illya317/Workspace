import { z } from "zod";
import { createCompany, listCompanies, updateCompany } from "@workspace/capital-securities/server";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";

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
  buildCommand: ({ body, user, request }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    return idempotencyKey
      ? okCommand({ userId: user.userId, idempotencyKey, body })
      : failCommand("缺少 Idempotency-Key 请求头");
  },
  action: createCompany,
});

export const PUT = createCommandRoute({
  bodySchema: companyBodySchema.extend({
    id: z.coerce.number().int().positive(),
    version: z.coerce.number().int().nonnegative(),
    partyVersion: z.coerce.number().int().nonnegative(),
    legalFactRevision: z.coerce.number().int().nonnegative(),
  }),
  buildCommand: ({ body, user, request }) => {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    return idempotencyKey
      ? okCommand({ userId: user.userId, idempotencyKey, body })
      : failCommand("缺少 Idempotency-Key 请求头");
  },
  action: updateCompany,
});
