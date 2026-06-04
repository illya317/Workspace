import { redirect } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";
import { MODULES } from "@/app/lib/module-nav";
import AppShell from "@/app/components/AppShell";
import ModuleHome from "@/app/components/ModuleHome";

export default async function AdministrationPage() {
  const user = await requireResourceAccess("administration");

  const mod = MODULES.find((m) => m.key === "administration");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
