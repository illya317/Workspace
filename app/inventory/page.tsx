import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
  const user = await requireResourceAccess("production.inventory");
  return (
    <AppShell title="库存管理" backHref="/production" user={user}>
      <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs text-amber-700">
        历史 fallback
      </div>
      <InventoryClient user={user} hideShell />
    </AppShell>
  );
}
