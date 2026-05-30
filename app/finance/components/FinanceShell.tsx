"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

interface Props {
  activeNav: string;
  children: React.ReactNode;
  user: SessionUser;
}

const navItems = [
  { key: "ledger", label: "总账基础", href: "/finance/ledger" },
  { key: "statements", label: "财务报表", href: "/finance/statements" },
  { key: "budget", label: "预算管理", href: "/finance/budget" },
  { key: "analysis", label: "财务分析", href: "/finance/analysis" },
  { key: "cost", label: "成本管理", href: "/finance/cost" },
  { key: "import", label: "数据导入", href: "/finance/import" },
];

export default function FinanceShell({ activeNav, children, user }: Props) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
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
              onClick={() => router.push("/finance")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
