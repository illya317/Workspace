import { createProtectedModulePage } from "@workspace/platform/server/protected-page";
import { HrPerformanceClient } from "@workspace/hr/ui";

export default createProtectedModulePage({
  route: "/hr/performance",
  title: "绩效管理",
  backHref: "/hr",
  render: ({ user }) => <HrPerformanceClient user={user} hideShell />,
});
