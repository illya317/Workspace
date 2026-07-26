import { z } from "zod";

import { executeRosterGeneratedCsvCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const exportQuerySchema = z.object({
  variant: z.enum(["management", "dueDiligence"]).catch("management"),
  keyword: z.string().catch(""),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  fields: z.string().catch(""),
  blankMergedCells: z.coerce.boolean().catch(false),
});

export const GET = createCommandRoute({
  querySchema: exportQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => okCommand(query),
  action: executeRosterGeneratedCsvCommand,
});
