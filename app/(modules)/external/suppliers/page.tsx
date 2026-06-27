import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { SuppliersClient } from "@workspace/external/ui";

export default async function SuppliersPage() {
  const user = await requireRouteAccess("/external/suppliers");

  return createElement(
    AppShell,
    { title: "供应商管理", backHref: "/external", user },
    <SuppliersClient />,
  );
}
