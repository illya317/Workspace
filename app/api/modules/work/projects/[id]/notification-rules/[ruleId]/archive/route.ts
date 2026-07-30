import { z } from "zod";

import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  archiveProjectNotificationRule,
  buildProjectNotificationRuleTransitionCommand,
  projectNotificationRuleVersionSchema,
} from "@workspace/work/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  ruleId: z.coerce.number().int().positive(),
}).strict();

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "项目或规则 ID 无效",
  bodySchema: projectNotificationRuleVersionSchema,
  bodyError: "规则版本无效",
  buildCommand: ({ params, body, user }) => buildProjectNotificationRuleTransitionCommand({
    userId: user.userId,
    projectId: params.id,
    ruleId: params.ruleId,
    version: body.version,
  }),
  action: archiveProjectNotificationRule,
});
