import { z } from "zod";

import { buildHrRouteCommand, correctEmployeePeriod } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  periodId: z.coerce.number().int().positive(),
}).strict();

const employmentPatchSchema = z.object({
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  leaveReason: z.string().trim().nullable().optional(),
  leaveNote: z.string().trim().nullable().optional(),
  officeLocation: z.string().trim().nullable().optional(),
  personnelType: z.string().trim().nullable().optional(),
  rank: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
}).strict();

const assignmentPatchSchema = z.object({
  reportingCompanyId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  positionId: z.number().int().positive().nullable().optional(),
  positionReportOverrideId: z.number().int().positive().nullable().optional(),
  isPrimary: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reportToPositionId: z.number().int().positive().nullable().optional(),
  allocationWeight: z.union([z.string(), z.number()]).nullable().optional(),
}).strict();

const bodySchema = z.discriminatedUnion("entityType", [
  z.object({
    entityType: z.literal("Employment"),
    expectedVersion: z.number().int().positive(),
    patch: employmentPatchSchema,
    reason: z.string().trim().max(1000).optional(),
  }).strict(),
  z.object({
    entityType: z.literal("EDP"),
    expectedVersion: z.number().int().positive(),
    patch: assignmentPatchSchema,
    reason: z.string().trim().max(1000).optional(),
  }).strict(),
]);

export const PATCH = createCommandRoute({
  paramsSchema,
  paramsError: "人员任职记录无效",
  bodySchema,
  bodyError: "修改内容无效",
  buildCommand: ({ params, body, user }) => buildHrRouteCommand({
    employeeId: params.id,
    periodId: params.periodId,
    input: body,
    userId: user.userId,
  }),
  action: ({ employeeId, periodId, input, userId }) => correctEmployeePeriod(employeeId, periodId, input, userId),
});
