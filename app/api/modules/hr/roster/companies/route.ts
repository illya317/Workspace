import { z } from "zod";

import { listCompanies } from "@workspace/capital-securities/server";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const companiesQuerySchema = z.object({
  keyword: z.string().catch(""),
  active: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: companiesQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => okCommand({
    keyword: query.keyword,
    activeOnly: query.active === "1",
    page: query.page,
    pageSize: query.pageSize,
  }),
  action: listCompanies,
});
