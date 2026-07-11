import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { CustomersClient } from "@workspace/external/ui";

export default createProtectedModulePage({
  route: "/external/customers",
  title: "客户管理",
  backHref: "/external",
  render: () => <CustomersClient />,
});
