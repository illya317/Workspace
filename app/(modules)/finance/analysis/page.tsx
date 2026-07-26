import { createProtectedModulePage } from "@workspace/platform/server/protected-page";
import { FinanceAnalysisClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/analysis",
  title: "管理会计",
  backHref: "/finance",
  render: ({ user }) => <FinanceAnalysisClient user={user} />,
});
