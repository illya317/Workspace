import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { MODULES } from "@/app/lib/module-nav";
import AppShell from "@/app/components/AppShell";
import ModuleHome from "@/app/components/ModuleHome";

export default async function ProductionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessInventory) redirect("/portal");

  const mod = MODULES.find((m) => m.key === "production");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" backLabel="返回入口" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
