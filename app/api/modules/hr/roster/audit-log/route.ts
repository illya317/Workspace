import { z } from "zod";

import { buildHrAuditLogCommand, executeHrAuditLogCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess } from "@workspace/platform/server/auth";

const auditLogQuerySchema = z.object({
  entityType: z.string().min(1),
  date: z.string().optional(),
  dates: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: auditLogQuerySchema,
  queryError: "缺少 entityType",
  buildCommand: ({ query }) => buildHrAuditLogCommand(query),
  action: executeHrAuditLogCommand,
});
