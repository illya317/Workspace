import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { StatementConfigClient } from "@workspace/finance/ui";

export default async function StatementConfigPage() {
  const user = await requireRouteAccess("/finance/statement-config");
  return createElement(
    AppShell,
    { title: "报表配置", backHref: "/finance", user },
    <StatementConfigClient user={user} />,
  );
}
