import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import SuppliersClient from "./SuppliersClient";

export default async function SuppliersPage() {
  const user = await requireAuth();

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <SuppliersClient />
    </AppShell>
  );
}
