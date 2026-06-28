import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { FinanceCostClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/cost",
  title: "成本管理",
  backHref: "/finance",
  render: ({ user }) => <FinanceCostClient user={user} />,
});
