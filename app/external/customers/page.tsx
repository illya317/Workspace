import { requireAuth } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const user = await requireAuth();

  return (
    <AppShell title="客户管理" backHref="/external" user={user}>
      <CustomersClient />
    </AppShell>
  );
}
