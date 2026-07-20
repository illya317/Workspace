import { redirect } from "next/navigation";
import { requireRouteAccess } from "./auth";
import { MODULES } from "../module-nav";
import { renderAppShellPage } from "../ui/app-shell-page";
import ModuleHome from "../ui/ModuleHome";

interface Props {
  moduleKey: string;
  backHref?: string;
}

/** Server composition root: authorization and route lookup stay outside presentation UI. */
export default async function ModuleHomePage({ moduleKey, backHref = "/portal" }: Props) {
  const mod = MODULES.find((module) => module.key === moduleKey);
  if (!mod) redirect("/portal");
  const user = await requireRouteAccess(mod.href);

  return renderAppShellPage({
    title: mod.label,
    backHref,
    user,
    children: <ModuleHome module={mod} user={user} />,
  });
}
