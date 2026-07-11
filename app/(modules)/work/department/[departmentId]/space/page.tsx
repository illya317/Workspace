import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkDepartmentSpacePage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const user = await requireRouteAccess("/work/me");
  const { departmentId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    title: "部门空间",
    backHref: `/work/department/${departmentId}`,
    initialTarget: { targetType: "department", targetId: Number(departmentId) },
  });
}
