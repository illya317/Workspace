import { redirect } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { MODULES } from "../module-nav";
import { renderAppShellPage } from "./app-shell-page";
import ModuleHome from "./ModuleHome";

interface Props {
  moduleKey: string;
  backHref?: string;
}

export default async function ModuleHomePage({ moduleKey, backHref = "/portal" }: Props) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) redirect("/portal");
  const user = await requireRouteAccess(mod.href);

  return renderAppShellPage({
    title: mod.label,
    backHref,
    user,
    children: <ModuleHome module={mod} user={user} />,
  });
}
