import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceCostClient } from "@workspace/finance/ui";

export default async function FinanceCostPage() {
  const user = await requireRouteAccess("/finance/cost");
  return createElement(
    AppShell,
    { title: "成本管理", backHref: "/finance", user },
    <FinanceCostClient user={user} />,
  );
}
