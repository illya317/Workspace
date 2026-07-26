import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";
import { isWorkspaceInternalRequestAuthorized } from "@workspace/platform/server/internal-unit-rpc";
import {
  clearReadUserNotifications,
  listUserNotifications,
  markAllUserNotificationsRead,
  updateUserNotification,
} from "@workspace/platform/server/notifications";
import {
  getUserPreferredProjectSettings,
  registerWorkDepartmentCollaborationNotificationActionProvider,
  registerWorkProjectMemberNotificationActionProvider,
  updateUserPreferredProjectIds,
} from "@workspace/work/server";
import { registerWorkWorkflowTodoProvider } from "@workspace/work/server/workflow-todo-provider";

const notificationQuerySchema = z.object({
  limit: z.number().int().min(1).max(50),
  offset: z.number().int().min(0),
  category: z.enum(["all", "ordinary", "workflow", "approval", "review", "publish"]).optional(),
  filter: z.enum(["all", "todo", "originated"]).optional(),
}).passthrough();

const bodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("notification.list"), userId: z.number().int().positive(), query: notificationQuerySchema }),
  z.object({ operation: z.literal("notification.clear"), userId: z.number().int().positive(), query: notificationQuerySchema }),
  z.object({ operation: z.literal("notification.markAllRead"), userId: z.number().int().positive(), query: notificationQuerySchema }),
  z.object({
    operation: z.literal("notification.update"),
    userId: z.number().int().positive(),
    id: z.number().int().positive(),
    action: z.enum(["read", "acknowledge", "reject", "clear"]),
  }),
  z.object({ operation: z.literal("preferredProjects.get"), userId: z.number().int().positive() }),
  z.object({
    operation: z.literal("preferredProjects.update"),
    userId: z.number().int().positive(),
    projectIds: z.array(z.number().int().positive()).max(3),
  }),
]);

registerWorkWorkflowTodoProvider();
registerWorkProjectMemberNotificationActionProvider();
registerWorkDepartmentCollaborationNotificationActionProvider();

export const POST = createInternalApiRoute({
  authorize: async ({ request }) => isWorkspaceInternalRequestAuthorized(
    request,
    await request.clone().text(),
    { allowedCallerUnitIds: ["workspace-shell"], audienceUnitId: "work" },
  ),
  authorizeError: "Internal service authentication failed",
  handler: async ({ request }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonErrorResponse("Invalid Work account RPC request", 400);
    const body = parsed.data;
    if (body.operation === "notification.list") {
      return NextResponse.json(await listUserNotifications(body.userId, body.query));
    }
    if (body.operation === "notification.clear") {
      return NextResponse.json(await clearReadUserNotifications(body.userId, body.query));
    }
    if (body.operation === "notification.markAllRead") {
      return NextResponse.json(await markAllUserNotificationsRead(body.userId, body.query));
    }
    if (body.operation === "notification.update") {
      const result = await updateUserNotification(body.userId, body.id, body.action);
      return result.success
        ? NextResponse.json({ success: true })
        : jsonErrorResponse(result.error, result.status);
    }
    if (body.operation === "preferredProjects.get") {
      return NextResponse.json(await getUserPreferredProjectSettings(body.userId));
    }
    try {
      const preferredProjectIds = await updateUserPreferredProjectIds(body.userId, body.projectIds);
      return NextResponse.json({ success: true, preferredProjectIds });
    } catch (error) {
      return jsonErrorResponse(error instanceof Error ? error.message : "保存常用项目失败", 400);
    }
  },
});
