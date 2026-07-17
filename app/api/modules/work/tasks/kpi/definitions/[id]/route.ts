import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildSaveKpiDefinitionCommand, executeSaveKpiDefinitionCommand } from "@workspace/work/server";

const workKpiDefinitionBodySchema = z.object({
  code: z.string(),
  status: z.enum(["draft", "active", "retired"]).optional(),
  name: z.string(),
  description: z.string().optional(),
  displayType: z.enum(["number", "percent", "currency", "count"]).optional(),
  unit: z.string().optional(),
  direction: z.enum(["higher_is_better", "lower_is_better", "target_range"]).optional(),
  scoringRule: z.object({
    kind: z.literal("linear"),
    targetScore: z.coerce.number(),
    floorScore: z.coerce.number(),
    capScore: z.coerce.number(),
  }).strip().optional(),
  ownerDepartmentId: z.coerce.number().int().positive(),
}).strip();

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: workKpiDefinitionBodySchema,
  paramsError: "KPI 指标定义 ID 无效",
  bodyError: "KPI 指标定义参数无效",
  buildCommand: ({ user, params, body }) => buildSaveKpiDefinitionCommand({
    userId: user.userId,
    definitionId: params.id,
    body,
  }),
  action: executeSaveKpiDefinitionCommand,
});
