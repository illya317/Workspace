import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getProjectWorkspaceEntry } from "@workspace/work/server";
import { WorkProjectWorkspaceFallback, WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkProjectSpacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireRouteAccess("/work/me");
  const { projectId } = await params;
  const projectNumber = Number(projectId);
  const entry = await getProjectWorkspaceEntry({ userId: user.id, projectId: projectNumber });

  if (!entry.ok) {
    return createElement(WorkProjectWorkspaceFallback, { message: entry.reason });
  }

  return createElement(WorkTasksPageView, {
    user,
    title: "项目空间",
    backHref: `/work/project/${entry.projectId}`,
    initialTarget: { targetType: "project", targetId: entry.projectId },
  });
}
