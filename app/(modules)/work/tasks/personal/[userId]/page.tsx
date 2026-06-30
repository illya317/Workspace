import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkTasksPersonalUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { userId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    initialTarget: { targetType: "personal", targetId: Number(userId) },
  });
}
