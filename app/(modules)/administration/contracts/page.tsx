import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { AppShell } from "@workspace/platform/ui";
import { ContractsClient } from "@workspace/administration/ui";

export default async function ContractsPage() {
  const user = await requireRouteAccess("/administration/contracts");
  return createElement(
    AppShell,
    { title: "合同台账", backHref: "/administration", user },
    <ContractsClient user={user} hideShell />,
  );
}
