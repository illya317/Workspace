import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { TaxPage } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/tax",
  title: "税务管理",
  backHref: "/finance",
  render: () => <TaxPage />,
});
