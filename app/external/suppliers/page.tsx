import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import SuppliersClient from "./SuppliersClient";

export default async function SuppliersPage() {
  const user = await requireResourceAccess("external.supplier");

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <SuppliersClient />
    </AppShell>
  );
}
