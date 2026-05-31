import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { canUseHr } from "@/server/auth/guard";
import { MODULES } from "@/app/lib/module-nav";
import AppShell from "@/app/components/AppShell";
import ModuleHome from "@/app/components/ModuleHome";

const HR_KEYS = ["people.roster", "people.performance", "people.analytics"];

export default async function HRHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseHr(user)) redirect("/portal");
  if (!HR_KEYS.some((k) => user.visibleResourceKeys?.includes(k))) redirect("/portal");

  const mod = MODULES.find((m) => m.key === "hr");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
