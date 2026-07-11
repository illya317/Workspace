import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkTasksPageView } from "@workspace/work/ui";

export default async function WorkMePage() {
  const user = await requireRouteAccess("/work/me");
  return createElement(WorkTasksPageView, {
    user,
    title: "工作空间",
    backHref: "/work",
    initialTarget: { targetType: "personal", targetId: user.id },
  });
}
