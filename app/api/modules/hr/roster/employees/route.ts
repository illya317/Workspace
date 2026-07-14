import { z } from "zod";

import { buildHrRouteCommand, executeCreateEmployeeWithAccountCommand, listEmployees, updateEmployeePageDraft } from "@workspace/hr/server";
import { updateFieldsBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";const employeesQuerySchema = z.object({
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
  querySchema: employeesQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: listEmployees,
});

export const POST = createCommandRoute({
  bodySchema: createEmployeeSchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ name: body.name, userId: user.userId }),
  action: executeCreateEmployeeWithAccountCommand,
});

export const PUT = createCommandRoute({
  bodySchema: updateFieldsBodySchema,
  bodyError: "修改内容无效",
  buildCommand: ({ body, user }) => buildHrRouteCommand({
    changes: body.changes.map((change) => ({ ...change, value: change.value ?? null })),
    userId: user.userId,
  }),
  action: updateEmployeePageDraft,
});
