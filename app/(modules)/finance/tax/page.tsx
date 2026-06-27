import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { PageSurface } from "@workspace/core/ui";

export default async function TaxPage() {
  const user = await requireRouteAccess("/finance/tax");
  return createElement(
    AppShell,
    { title: "税务管理", backHref: "/finance", user },
    <PageSurface kind="list" blocks={[
      { kind: "section", key: "tax", title: "税务管理", subtitle: "销项/进项、税负分析、发票管理、纳税申报辅助", blocks: [
        { kind: "data", key: "empty", surface: { kind: "records", records: [], empty: "税务管理规划中" } },
      ] },
    ]} />,
  );
}
