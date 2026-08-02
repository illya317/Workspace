import { z } from "zod";

import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  listProjectNotificationEvaluations,
  projectNotificationEvaluationQueryRequestSchema,
} from "@workspace/work/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  ruleId: z.coerce.number().int().positive(),
}).strict();

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "项目或规则 ID 无效",
  querySchema: projectNotificationEvaluationQueryRequestSchema,
  buildCommand: ({ params, query, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    ruleId: params.ruleId,
    page: query.page,
    pageSize: query.pageSize,
  }),
  action: listProjectNotificationEvaluations,
});
