import { redirect } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { MODULES } from "../module-nav";
import AppShell from "./AppShell";
import ModuleHome from "./ModuleHome";

interface Props {
  moduleKey: string;
  backHref?: string;
}

export default async function ModuleHomePage({ moduleKey, backHref = "/portal" }: Props) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) redirect("/portal");
  const user = await requireRouteAccess(mod.href);

  return (
    <AppShell title={mod.label} backHref={backHref} user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}
