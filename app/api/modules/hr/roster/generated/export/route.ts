import { z } from "zod";

import { buildRosterGeneratedCsvCommand, executeRosterGeneratedCsvCommand } from "@workspace/hr/server";
import { authorize } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";

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
  access: (userId: number) => authorize({ user: userId, resourceKey: "hr.roster.generated", action: "access" }),
  querySchema: exportQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildRosterGeneratedCsvCommand(query),
  action: executeRosterGeneratedCsvCommand,
});
