import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { FinanceImportClient } from "@workspace/finance/ui";

export default async function ImportPage() {
  const user = await requireRouteAccess("/finance/import");
  return createElement(
    AppShell,
    { title: "数据导入", backHref: "/finance", user },
    <FinanceImportClient user={user} />,
  );
}
