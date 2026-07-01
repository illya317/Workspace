import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkTasksCommitteePage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { committeeId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    initialTarget: { targetType: "committee", targetId: Number(committeeId) },
  });
}
