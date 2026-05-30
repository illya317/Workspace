import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { MODULES } from "@/app/lib/module-nav";
import ModuleHome from "@/app/components/ModuleHome";

export default async function ProductionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessInventory) redirect("/portal");

  const mod = MODULES.find((m) => m.key === "production");
  if (!mod) redirect("/portal");

  return <ModuleHome module={mod} user={user} />;
}
