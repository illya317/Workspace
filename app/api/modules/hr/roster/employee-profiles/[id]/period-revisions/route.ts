import { z } from "zod";

import { buildHrRouteCommand, reviseEmployeePeriod } from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const bodySchema = z.object({
  entityType: z.enum(["Employment", "EDP"]),
  periodId: z.coerce.number().int().positive(),
  expectedVersion: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "员工ID无效",
  bodySchema,
  bodyError: "周期修订内容无效",
  buildCommand: ({ params, body, user }) => buildHrRouteCommand({
    employeeId: params.id,
    input: body,
    userId: user.userId,
  }),
  action: ({ employeeId, input, userId }) => reviseEmployeePeriod(employeeId, input, userId),
});
