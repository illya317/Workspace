import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildRespondDepartmentCollaborationCommand,
  executeRespondDepartmentCollaborationCommand,
} from "@workspace/work/server";

const responseSchema = z.object({
  departmentId: z.coerce.number(),
  action: z.enum(["accept", "reject"]),
  note: z.string().nullable().optional(),
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "协作事项 ID 无效",
  bodySchema: responseSchema,
  bodyError: "协作响应参数无效",
  buildCommand: ({ params, body, user }) => buildRespondDepartmentCollaborationCommand({
    userId: user.userId,
    collaborationId: params.id,
    body,
  }),
  action: executeRespondDepartmentCollaborationCommand,
});
