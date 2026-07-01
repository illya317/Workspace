import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { StatementReviewClient } from "@workspace/finance/ui";

export default async function FinanceStatementReviewPage() {
  const user = await requireRouteAccess("/finance/statement-review");
  const [canCreate, canWrite, canApprove] = await Promise.all([
    evaluatePermissionAction(user.id, "finance.statementReview", "create"),
    evaluatePermissionAction(user.id, "finance.statementReview", "write"),
    evaluatePermissionAction(user.id, "finance.statementReview", "approve"),
  ]);

  return renderAppShellPage({
    title: "报表校对",
    backHref: "/finance",
    user,
    children: <StatementReviewClient canCreate={canCreate} canWrite={canWrite} canApprove={canApprove} />,
  });
}
