import { redirect } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { MODULES } from "@workspace/platform/module-nav";
import AppShell from "@workspace/platform/ui/AppShell";
import ModuleHome from "@workspace/platform/ui/ModuleHome";

export default async function LibraryHomePage() {
  const user = await requireResourceAccess("library");

  const mod = MODULES.find((m) => m.key === "library");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
