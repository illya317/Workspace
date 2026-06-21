import { redirect } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import ModuleHome from "@workspace/platform/ui/ModuleHome";
import { MODULES } from "@workspace/platform/module-nav";

export default async function ExternalPage() {
  const user = await requireResourceAccess("external");

  const mod = MODULES.find((m) => m.key === "external");
  if (!mod) redirect("/portal");

  return (
    <AppShell title="外部关系" backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
