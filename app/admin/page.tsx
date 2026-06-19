import { requireAdminManageAccess } from "@workspace/platform/server/auth";
import { AppShell } from "@workspace/platform/ui";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const user = await requireAdminManageAccess();
  return (
    <AppShell title="管理后台" backHref="/settings" user={user}>
      <AdminClient user={user} />
    </AppShell>
  );
}
