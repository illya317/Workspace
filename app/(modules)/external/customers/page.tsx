import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { CustomersClient } from "@workspace/external/ui";

export default async function CustomersPage() {
  const user = await requireRouteAccess("/external/customers");

  return createElement(
    AppShell,
    { title: "客户管理", backHref: "/external", user },
    <CustomersClient />,
  );
}
