import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildListKpiDefinitionsCommand,
  buildSaveKpiDefinitionCommand,
  executeListKpiDefinitionsCommand,
  executeSaveKpiDefinitionCommand,
} from "@workspace/work/server";

const definitionQuerySchema = z.object({
  targetType: z.string().optional(),
  targetId: z.coerce.number().int().positive().optional(),
  ownerDepartmentId: z.coerce.number().int().positive().optional(),
  includeRetired: z.string().optional(),
}).strip();

const scoringRuleSchema = z.object({
  kind: z.literal("linear"),
  targetScore: z.coerce.number(),
  floorScore: z.coerce.number(),
  capScore: z.coerce.number(),
}).strip();

const workKpiDefinitionBodySchema = z.object({
  code: z.string(),
  status: z.enum(["draft", "active", "retired"]).optional(),
  name: z.string(),
  description: z.string().optional(),
  displayType: z.enum(["number", "percent", "currency", "count"]).optional(),
  unit: z.string().optional(),
  direction: z.enum(["higher_is_better", "lower_is_better", "target_range"]).optional(),
  scoringRule: scoringRuleSchema.optional(),
  ownerDepartmentId: z.coerce.number().int().positive(),
}).strip();

export const GET = createCommandRoute({
  querySchema: definitionQuerySchema,
  buildCommand: ({ user, query }) => buildListKpiDefinitionsCommand({ user, query }),
  action: executeListKpiDefinitionsCommand,
});

export const POST = createCommandRoute({
  bodySchema: workKpiDefinitionBodySchema,
  bodyError: "KPI 指标定义参数无效",
  buildCommand: ({ user, body }) => buildSaveKpiDefinitionCommand({ userId: user.userId, body }),
  action: executeSaveKpiDefinitionCommand,
});
