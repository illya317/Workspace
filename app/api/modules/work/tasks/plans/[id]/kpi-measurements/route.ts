import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildKpiPlanCommand, executeUpdateKpiMeasurementsCommand } from "@workspace/work/server";

const bodySchema = z.object({
  measurements: z.array(z.object({
    assignmentId: z.coerce.number().int().positive(),
    version: z.coerce.number().int().positive(),
    currentValue: z.coerce.number().finite(),
  }).strip()).min(1).max(100),
}).strip();

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema,
  paramsError: "OKR 计划 ID 无效",
  bodyError: "KPI 实际值参数无效",
  buildCommand: ({ user, params, body }) => buildKpiPlanCommand({ userId: user.userId, planId: params.id, body }),
  action: executeUpdateKpiMeasurementsCommand,
});
