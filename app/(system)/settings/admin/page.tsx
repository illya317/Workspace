import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { AdminManagePageView } from "@workspace/platform/ui/system/SystemPages";

export default async function AdminPage() {
  const user = await requireRouteAccess("/settings/admin");
  return createElement(AdminManagePageView, { user });
}
