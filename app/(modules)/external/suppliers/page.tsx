import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { SuppliersClient } from "@workspace/external/ui";

export default async function SuppliersPage() {
  const user = await requireResourceAccess("external.suppliers");

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <SuppliersClient />
    </AppShell>
  );
}
