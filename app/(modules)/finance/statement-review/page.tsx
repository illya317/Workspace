import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { StatementReviewClient } from "@workspace/finance/ui";

export default async function StatementReviewPage() {
  const user = await requireRouteAccess("/finance/statement-review");
  return createElement(
    AppShell,
    { title: "报表校对", backHref: "/finance", user },
    <StatementReviewClient />,
  );
}
