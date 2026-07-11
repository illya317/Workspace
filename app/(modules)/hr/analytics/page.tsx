import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { HRAnalyticsClient } from "@workspace/hr/ui";

export default createProtectedModulePage({
  route: "/hr/analytics",
  title: "人力分析",
  backHref: "/hr",
  render: ({ user }) => <HRAnalyticsClient user={user} hideShell />,
});
