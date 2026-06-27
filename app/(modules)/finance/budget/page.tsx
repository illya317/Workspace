import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { BudgetTab } from "@workspace/finance/ui";

export default async function BudgetPage() {
  const user = await requireRouteAccess("/finance/budget");
  return createElement(
    AppShell,
    { title: "预算管理", backHref: "/finance", user },
    <BudgetTab user={user} />,
  );
}
