import { z } from "zod";

import { executeRosterCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";import { okCommand } from "@workspace/platform/server/domain-validation";

const rosterQuerySchema = z.object({
  raw: z.string().optional(),
  dept: z.string().catch(""),
  keyword: z.string().catch(""),
  export: z.string().optional(),
});

export const GET = createCommandRoute({
  querySchema: rosterQuerySchema,
  buildCommand: ({ query, user }) => okCommand({
    raw: query.raw === "1",
    dept: query.dept,
    keyword: query.keyword,
    exportExcel: query.export === "1",
    userId: user.userId,
  }),
  action: executeRosterCommand,
});
