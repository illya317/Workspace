import { z } from "zod";
import {
  listSpacePermissions,
  updateSpacePermissions,
} from "@workspace/platform/server/docs-editor";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const paramsSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
});

const permissionsBodySchema = z.object({
  permissions: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    role: z.enum(["viewer", "editor", "delete", "manager"]),
  })),
});

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    spaceId: params.spaceId,
  }),
  action: (command) => listSpacePermissions(command),
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  bodySchema: permissionsBodySchema,
  bodyError: "权限参数无效",
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    spaceId: params.spaceId,
    permissions: body.permissions,
  }),
  action: (command) => updateSpacePermissions(command),
});
