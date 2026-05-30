import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessInventory) redirect("/portal");
  return (
    <AppShell title="库存管理" backHref="/production" user={user}>
      <InventoryClient user={user} hideShell />
    </AppShell>
  );
}
