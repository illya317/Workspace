import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const user = await requireAuth();

  return (
    <AppShell title="客户管理" backHref="/external" user={user}>
      <CustomersClient />
    </AppShell>
  );
}
