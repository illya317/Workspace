import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ModuleHome from "@/app/components/ModuleHome";
import { MODULES } from "@/app/lib/module-nav";

export default async function ExternalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessExternal) redirect("/portal");

  const mod = MODULES.find((m) => m.key === "external");
  if (!mod) redirect("/portal");

  return (
    <AppShell title="外部关系" backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
