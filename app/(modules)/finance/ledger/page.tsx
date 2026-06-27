import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { LedgerClient } from "@workspace/finance/ui";

export default async function LedgerPage() {
  const user = await requireRouteAccess("/finance/ledger");
  const canWrite = user.visibleWriteResourceKeys?.includes("finance.ledger") ?? false;
  return createElement(
    AppShell,
    { title: "总账基础", backHref: "/finance", user },
    <LedgerClient canWrite={canWrite} user={user} />,
  );
}
