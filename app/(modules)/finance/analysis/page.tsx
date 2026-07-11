import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { FinanceAnalysisClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/analysis",
  title: "财务分析",
  backHref: "/finance",
  render: ({ user }) => <FinanceAnalysisClient user={user} />,
});
