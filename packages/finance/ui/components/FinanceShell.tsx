"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { PageShell } from "@workspace/core/ui";
import {
  MODULE_LIFECYCLE_BY_RESOURCE,
  MODULE_LIFECYCLE_LABELS,
} from "@workspace/platform/module-lifecycle";
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
  hideShell,
}: FinanceShellProps) {
  const router = useRouter();
  const navItems = getFinanceNavItems(user);
  const lifecycleStatus = MODULE_LIFECYCLE_BY_RESOURCE[`finance.${activeNav}`];
  const title = "财务管理";

  return (
    <>
      {!hideShell ? (
        <PageShell
          title={title}
          onBack={() => router.push(activeNav ? "/finance" : "/portal")}
          backLabel="返回入口"
          actions={navItems.map((item) => ({ label: item.label, onClick: () => router.push(item.href) }))}
          leading={(
            <button type="button" onClick={() => router.push("/finance")} className="flex items-center gap-3">
              <Image
                src="/workspace/company/logo.png"
                alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
                width={100}
                height={30}
                className="h-auto w-auto max-w-[100px] object-contain"
              />
            </button>
          )}
          trailing={<UserMenu user={user} />}
        >
          {lifecycleStatus && lifecycleStatus !== "workspace-owned" && (
            <div className="border-b border-amber-200 bg-amber-50">
              <div className="mx-auto max-w-5xl px-4 py-2 text-xs text-amber-800">
                {MODULE_LIFECYCLE_LABELS[lifecycleStatus]}
              </div>
            </div>
          )}
          {children}
        </PageShell>
      ) : (
        children
      )}
    </>
  );
}
