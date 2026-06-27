import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { StatementsClient } from "@workspace/finance/ui";

export default async function StatementsPage() {
  const user = await requireRouteAccess("/finance/statements");
  return createElement(
    AppShell,
    { title: "财务报表", backHref: "/finance", user },
    <StatementsClient />,
  );
}
