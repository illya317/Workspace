import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { HRPerformanceClient } from "@workspace/hr/ui";

export default createProtectedModulePage({
  route: "/hr/performance",
  title: "考勤绩效",
  backHref: "/hr",
  render: ({ user }) => <HRPerformanceClient user={user} hideShell />,
});
