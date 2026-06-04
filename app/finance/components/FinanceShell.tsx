"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";
import { getFinanceNavItems } from "@/app/finance/lib/nav-utils";
import { MODULE_LIFECYCLE_BY_RESOURCE, MODULE_LIFECYCLE_LABELS } from "@/app/lib/module-lifecycle";

interface Props {
  activeNav: string;
  children: React.ReactNode;
  user: SessionUser;
  hideShell?: boolean;
}

export default function FinanceShell({ activeNav, children, user, hideShell }: Props) {
  const router = useRouter();
  const navItems = getFinanceNavItems(user);
  const lifecycleStatus = MODULE_LIFECYCLE_BY_RESOURCE[`finance.${activeNav}`];

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <button
              onClick={() => router.push("/finance")}
              className="text-sm font-medium text-gray-700 hover:text-emerald-600"
            >
              财务管理
            </button>
          </div>
          <div className="flex items-center gap-4">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => router.push(item.href)}
                className={`text-sm ${
                  activeNav === item.key
                    ? "font-medium text-emerald-600"
                    : "text-gray-500 hover:text-emerald-600"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => router.push(activeNav ? "/finance" : "/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}
      {!hideShell && lifecycleStatus && lifecycleStatus !== "workspace-owned" && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-5xl px-4 py-2 text-xs text-amber-800">
            {MODULE_LIFECYCLE_LABELS[lifecycleStatus]}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
