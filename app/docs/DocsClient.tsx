"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

const DOC_CATEGORIES: Record<string, Array<{ title: string; href: string }>> = {
  "入职指南": [
    { title: "入职流程说明", href: "/docs/onboarding" },
    { title: "公司制度介绍", href: "/docs/policies" },
    { title: "办公环境指引", href: "/docs/office-guide" },
  ],
  "常用工具": [
    { title: "系统使用手册", href: "/docs/system-guide" },
    { title: "工作汇报填写说明", href: "/docs/report-guide" },
    ...(user.canAccessApi ? [{ title: "接入指南", href: "/api-guide" }] : []),
  ],
  "规章制度": [
    { title: "考勤管理制度", href: "/docs/attendance" },
    { title: "请假流程", href: "/docs/leave" },
    { title: "报销规范", href: "/docs/expense" },
  ],
  "岗位管理": [
    { title: "GMP 岗位说明书", href: "/docs/positions/GMP" },
  ],
};

export default function DocsClient({ user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回</button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-800">文档中心</h1>
        <p className="mb-8 text-sm text-gray-500">
          员工手册、操作指南、规章制度等文档汇总
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Object.entries(DOC_CATEGORIES).map(([category, docs]) => (
            <div key={category} className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">
                {category}
              </h2>
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li key={doc.href}>
                    <a
                      href={doc.href}
                      className="block rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-emerald-600"
                    >
                      {doc.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
