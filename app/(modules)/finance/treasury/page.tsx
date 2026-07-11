import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { TreasuryPage } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/treasury",
  title: "司库管理",
  backHref: "/finance",
  render: () => <TreasuryPage />,
});
