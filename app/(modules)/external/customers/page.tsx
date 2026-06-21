import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { CustomersClient } from "@workspace/external/ui";

export default async function CustomersPage() {
  const user = await requireRouteAccess("/external/customers");

  return (
    <AppShell title="客户管理" backHref="/external" user={user}>
      <CustomersClient />
    </AppShell>
  );
}
