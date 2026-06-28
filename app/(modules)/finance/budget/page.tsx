import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { BudgetTab } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/budget",
  title: "预算管理",
  backHref: "/finance",
  render: ({ user }) => <BudgetTab user={user} />,
});
