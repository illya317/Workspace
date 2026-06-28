import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { SuppliersClient } from "@workspace/external/ui";

export default createProtectedModulePage({
  route: "/external/suppliers",
  title: "供应商管理",
  backHref: "/external",
  render: () => <SuppliersClient />,
});
