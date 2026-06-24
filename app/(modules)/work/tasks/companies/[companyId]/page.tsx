import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkTasksCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { companyId } = await params;
  return createElement(WorkTasksPageView, {
    user,
    initialTarget: { targetType: "company", targetId: Number(companyId) },
  });
}
