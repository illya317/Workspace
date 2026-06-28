import { z } from "zod";

import { buildHrRouteCommand, executeCreateEmployeeWithAccountCommand, listEmployees } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";

const employeesQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  position: z.string().catch(""),
  employmentStatus: z.enum(["active", "inactive"]).optional().catch(undefined),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createEmployeeSchema = z.object({
  name: z.string().min(1, "姓名必填"),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: employeesQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: listEmployees,
});

export const POST = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: createEmployeeSchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ name: body.name, userId: user.userId }),
  action: executeCreateEmployeeWithAccountCommand,
});
