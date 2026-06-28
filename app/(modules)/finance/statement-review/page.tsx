import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { StatementReviewClient } from "@workspace/finance/ui";

export default createProtectedModulePage({
  route: "/finance/statement-review",
  title: "报表校对",
  backHref: "/finance",
  render: () => <StatementReviewClient />,
});
