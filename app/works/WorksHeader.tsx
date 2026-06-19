"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@workspace/platform/ui/UserMenu";
import NavLink from "@workspace/platform/ui/NavLink";
import DepartmentSwitcher from "@workspace/platform/ui/DepartmentSwitcher";
import type { SessionUser } from "@workspace/platform/types";

export default function WorksHeader({
  user, onDeptChange, hideShell,
}: {
  user: SessionUser; onDeptChange: () => void; hideShell?: boolean;
}) {
  const router = useRouter();
  if (hideShell) return null;
  return (
    <nav className="bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Image src="/workspace/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
          {!hideShell && <DepartmentSwitcher onChange={onDeptChange} />}
        </div>
        <div className="flex items-center gap-5">
          {!hideShell && (<>
          <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
          <NavLink href="/reports">工作汇报</NavLink>
          <NavLink href="/works">工作清单</NavLink>
          <NavLink href="/history">历史记录</NavLink>
          </>)}
          <UserMenu user={user} />
        </div>
      </div>
    </nav>
  );
}
