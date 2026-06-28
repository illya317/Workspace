import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { StatementsClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/statements",
  title: "财务报表",
  backHref: "/finance",
  render: () => <StatementsClient />,
});
