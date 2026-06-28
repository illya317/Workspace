import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { HRClient } from "@workspace/hr/ui";

export default createProtectedModulePage({
  route: "/hr/roster",
  title: "人事基础资料",
  backHref: "/hr",
  render: ({ user }) => <HRClient user={user} hideShell />,
});
