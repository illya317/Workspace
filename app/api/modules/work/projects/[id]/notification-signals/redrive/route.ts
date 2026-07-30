import { z } from "zod";

import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildRedriveProjectNotificationSignalCommand,
  redriveFailedProjectNotificationSignal,
  redriveProjectNotificationSignalSchema,
} from "@workspace/work/server";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

export const POST = createCommandRoute({
  paramsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: redriveProjectNotificationSignalSchema,
  bodyError: "项目通知信号重试请求无效",
  buildCommand: ({ params, body, user }) => buildRedriveProjectNotificationSignalCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: redriveFailedProjectNotificationSignal,
});
