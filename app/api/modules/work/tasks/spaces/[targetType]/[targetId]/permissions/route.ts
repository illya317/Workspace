import { z } from "zod";

import {
  buildUpdateWorkSpacePermissionsRouteCommand,
  buildWorkSpacePermissionsRouteCommand,
  executeListWorkSpacePermissionsRouteCommand,
  executeUpdateWorkSpacePermissionsRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.coerce.number().int().positive(),
});

const permissionSchema = z.object({
  permissions: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    role: z.enum(["viewer", "editor", "delete", "manager"]),
    kind: z.literal("task").optional(),
  })),
});

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  buildCommand: ({ params, user }) => buildWorkSpacePermissionsRouteCommand({
    userId: user.userId,
    params,
  }),
  action: executeListWorkSpacePermissionsRouteCommand,
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  bodySchema: permissionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ params, body, user }) => buildUpdateWorkSpacePermissionsRouteCommand({
    userId: user.userId,
    params,
    body,
  }),
  action: executeUpdateWorkSpacePermissionsRouteCommand,
});
