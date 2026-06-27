import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { InvestorsClient } from "@workspace/external/ui";

export default async function InvestorsPage() {
  const user = await requireRouteAccess("/external/investors");

  return createElement(
    AppShell,
    { title: "投资人关系", backHref: "/external", user },
    <InvestorsClient />,
  );
}
