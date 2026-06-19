import { requireAuth } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import SuppliersClient from "./SuppliersClient";

export default async function SuppliersPage() {
  const user = await requireAuth();

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <SuppliersClient />
    </AppShell>
  );
}
