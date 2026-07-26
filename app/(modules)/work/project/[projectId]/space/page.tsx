import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getAccessibleProjectWorkspaceEntry } from "@workspace/work/server";
import { WorkProjectWorkspaceFallback, WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkProjectSpacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectNumber = Number(projectId);
  const user = await requireRouteAccess("/work/me");
  const entry = await getAccessibleProjectWorkspaceEntry({ userId: user.id, projectId: projectNumber });

  if (!entry.ok) {
    return createElement(WorkProjectWorkspaceFallback, { message: entry.reason });
  }

  return createElement(WorkTasksPageView, {
    user,
    title: "项目空间",
    initialTarget: { targetType: "project", targetId: entry.projectId },
  });
}
