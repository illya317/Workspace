import { z } from "zod";

import { isEmploymentPositionOptionalTitle } from "@workspace/hr/constants/employee-temporal-write-policy";
import { buildHrRouteCommand, recordEmployeeLifecycleEvent } from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const nullablePositiveId = z.coerce.number().int().positive().nullable().optional();
const nullableText = z.string().nullable().optional();

const lifecycleBodySchema = z.object({
  eventType: z.enum(["onboard", "transfer", "concurrent_assignment", "reporting_change", "offboard"]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: nullableText,
  sourceAssignmentId: nullablePositiveId,
  assignmentEndDate: nullableText,
  reportingCompanyId: nullablePositiveId,
  departmentId: nullablePositiveId,
  positionId: nullablePositiveId,
  positionReportOverrideId: nullablePositiveId,
  reportToPositionId: nullablePositiveId,
  workPercent: nullableText,
  officeLocation: nullableText,
  personnelType: nullableText,
  rank: nullableText,
  title: nullableText,
  leaveReason: nullableText,
  leaveNote: nullableText,
}).superRefine((value, context) => {
  if (
    value.eventType === "offboard"
    || (value.eventType === "onboard" && isEmploymentPositionOptionalTitle(value.title))
  ) return;
  for (const field of ["reportingCompanyId", "departmentId", "positionId", "workPercent"] as const) {
    if (value[field] !== null && value[field] !== undefined && value[field] !== "") continue;
    context.addIssue({ code: "custom", path: [field], message: `${field} required` });
  }
});

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "员工ID无效",
  bodySchema: lifecycleBodySchema,
  bodyError: "生命周期变更内容无效",
  buildCommand: ({ params, body, user }) => buildHrRouteCommand({
    employeeId: params.id,
    input: body,
    userId: user.userId,
  }),
  action: ({ employeeId, input, userId }) => recordEmployeeLifecycleEvent(employeeId, input, userId),
});
