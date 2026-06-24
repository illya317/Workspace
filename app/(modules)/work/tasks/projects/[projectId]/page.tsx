import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkTasksProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { projectId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    initialTarget: { targetType: "project", targetId: Number(projectId) },
  });
}
