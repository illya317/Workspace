import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const user = await requireResourceAccess("external.customer");

  return (
    <AppShell title="客户管理" backHref="/external" user={user}>
      <CustomersClient />
    </AppShell>
  );
}
