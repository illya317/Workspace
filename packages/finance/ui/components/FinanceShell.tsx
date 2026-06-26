"use client";

import { useRouter } from "next/navigation";
import { PageSurface } from "@workspace/core/ui";
import { MODULE_LIFECYCLE_BY_RESOURCE, MODULE_LIFECYCLE_LABELS } from "@workspace/platform/module-lifecycle";
import { UserMenu } from "@workspace/platform/ui";
import type { SessionUser } from "@workspace/platform/types";
import { getFinanceNavItems } from "../navigation/nav-utils";
interface FinanceShellProps {
  activeNav: string;
  children: React.ReactNode;
  user: SessionUser;
  hideShell?: boolean;
}
export default function FinanceShell({
  activeNav,
  children,
  user,
  hideShell
}: FinanceShellProps) {
  const router = useRouter();
  const navItems = getFinanceNavItems(user);
  const lifecycleStatus = MODULE_LIFECYCLE_BY_RESOURCE[`finance.${activeNav}`];
  const title = "财务管理";
  const activeHref = navItems.find(item => item.href.includes(activeNav))?.href ?? "";
  if (hideShell) return <>{children}</>;
  return <div className="min-h-screen">
      <PageSurface
        kind="list"
        embedded
        blocks={[
          {
            kind: "form",
            key: "shell-actions",
            surface: {
              kind: "inline",
              actions: [
                { key: "home", label: title, variant: "secondary", onClick: () => router.push("/finance") },
                { key: "back", label: "返回入口", variant: "secondary", onClick: () => router.push(activeNav ? "/finance" : "/portal") },
              ],
            },
          },
          {
            kind: "navigation",
            key: "finance-nav",
            surface: {
              kind: "tabs",
              tabs: {
                tabs: navItems.map(item => ({ key: item.href, label: item.label })),
                active: activeHref,
                onChange: (href: string) => router.push(href),
                variant: "small",
                ariaLabel: "财务导航",
              },
            },
          },
          {
            kind: "moduleView",
            key: "user-menu",
            view: <UserMenu user={user} />,
          },
          ...(lifecycleStatus && lifecycleStatus !== "workspace-owned" ? [{
            kind: "message" as const,
            key: "lifecycle",
            tone: "warning" as const,
            content: MODULE_LIFECYCLE_LABELS[lifecycleStatus],
          }] : []),
        ]}
      />
      {children}
    </div>;
}
