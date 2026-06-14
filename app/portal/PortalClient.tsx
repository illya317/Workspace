"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { SessionUser } from "@/lib/types";
import { getAccessibleModules } from "@/app/lib/module-nav";

export default function PortalClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const entries = getAccessibleModules(user);

  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600", ring: "hover:ring-emerald-400" },
    blue: { bg: "bg-blue-100", text: "text-blue-600", ring: "hover:ring-blue-400" },
    indigo: { bg: "bg-indigo-100", text: "text-indigo-600", ring: "hover:ring-indigo-400" },
    purple: { bg: "bg-purple-100", text: "text-purple-600", ring: "hover:ring-purple-400" },
    amber: { bg: "bg-amber-100", text: "text-amber-600", ring: "hover:ring-amber-400" },
    orange: { bg: "bg-orange-100", text: "text-orange-600", ring: "hover:ring-orange-400" },
    cyan: { bg: "bg-cyan-100", text: "text-cyan-600", ring: "hover:ring-cyan-400" },
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 flex flex-col items-center">
        <Image
          src="/workspace/company/logo.png"
          alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
          width={200}
          height={60}
          className="h-auto w-auto max-w-[200px] object-contain"
        />
        <h1 className="mt-4 text-2xl font-bold text-gray-800">
          {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">欢迎，{user.name}</p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        {entries.map((entry) => {
          const c = colorMap[entry.color];
          return (
            <button
              key={entry.key}
              onClick={() => router.push(entry.href)}
              className={`group flex flex-col items-center rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md hover:ring-2 ${c.ring}`}
            >
              <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${c.bg} ${c.text}`}>
                {entry.icon}
              </div>
              <h2 className="text-base font-semibold text-gray-800">{entry.label}</h2>
              <p className="mt-1 text-xs text-gray-500">{entry.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
