import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { MODULES } from "@/app/lib/module-nav";
import AppShell from "@/app/components/AppShell";
import ModuleHome from "@/app/components/ModuleHome";

export default async function AdministrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const mod = MODULES.find((m) => m.key === "administration");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
