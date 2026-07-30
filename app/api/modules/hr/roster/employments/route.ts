import { z } from "zod";

import { buildHrRouteCommand, createEmploymentPeriod, listEmployments, updateEmploymentPageDraft } from "@workspace/hr/server";
import { updateFieldsBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const employmentsQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  departmentId: z.coerce.number().int().positive().optional().catch(undefined),
  position: z.string().catch(""),
  personnelType: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: employmentsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand({ ...query, isActive: query.isActive ?? null }),
  action: listEmployments,
});

const createEmploymentSchema = z.object({
  employeeId: z.number().int().positive(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  leaveReason: z.string().trim().nullable().optional(),
  leaveNote: z.string().trim().nullable().optional(),
  officeLocation: z.string().trim().nullable().optional(),
  personnelType: z.string().trim().nullable().optional(),
  rank: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
}).strict();

export const POST = createCommandRoute({
  bodySchema: createEmploymentSchema,
  bodyError: "雇佣期间内容无效",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ ...body, userId: user.userId }),
  action: createEmploymentPeriod,
});

export const PUT = createCommandRoute({
  bodySchema: updateFieldsBodySchema,
  bodyError: "修改内容无效",
  buildCommand: ({ body, user }) => buildHrRouteCommand({
    changes: body.changes.map((change) => ({ ...change, value: change.value ?? null })),
    userId: user.userId,
  }),
  action: updateEmploymentPageDraft,
});
