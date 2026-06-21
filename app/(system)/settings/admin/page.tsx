import { createElement } from "react";
import { requireAdminManageAccess } from "@workspace/platform/server/auth";
import { AdminManagePageView } from "@workspace/platform/ui/system/SystemPages";

export default async function AdminPage() {
  const user = await requireAdminManageAccess();
  return createElement(AdminManagePageView, { user });
}
