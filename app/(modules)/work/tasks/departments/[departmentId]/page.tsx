import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkTasksDepartmentPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { departmentId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    initialTarget: { targetType: "department", targetId: Number(departmentId) },
  });
}
