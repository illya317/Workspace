import { z } from "zod";

import { previewRosterGenerated } from "@workspace/hr/server";
import { authorize } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const previewQuerySchema = z.object({
  variant: z.enum(["management", "dueDiligence"]).catch("management"),
  keyword: z.string().catch(""),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export const GET = createCommandRoute({
  access: (userId: number) => authorize({ user: userId, resourceKey: "hr.roster.generated", action: "access" }),
  querySchema: previewQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => okCommand(query),
  action: previewRosterGenerated,
});
