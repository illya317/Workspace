import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceAnalysisClient } from "@workspace/finance/ui";

export default async function FinanceAnalysisPage() {
  const user = await requireRouteAccess("/finance/analysis");
  return createElement(
    AppShell,
    { title: "财务分析", backHref: "/finance", user },
    <FinanceAnalysisClient user={user} />,
  );
}
