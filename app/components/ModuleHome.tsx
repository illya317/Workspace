"use client";

import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { getSubModules, getEmptyMessage, type ModuleDef } from "@/app/lib/module-nav";

const subColors: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-600",
  blue: "bg-blue-100 text-blue-600",
  indigo: "bg-indigo-100 text-indigo-600",
  purple: "bg-purple-100 text-purple-600",
  amber: "bg-amber-100 text-amber-600",
  cyan: "bg-cyan-100 text-cyan-600",
  orange: "bg-orange-100 text-orange-600",
};

interface Props {
  module: ModuleDef;
  user: SessionUser;
}

/** L1 模块首页，风格与 Portal 一致：icon-circle 卡片网格 */
export default function ModuleHome({ module, user }: Props) {
  const router = useRouter();
  const children = getSubModules(user, module.key);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="mb-6 text-center text-sm text-gray-500">{module.desc}</p>

      {children.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <p className="text-gray-400">{getEmptyMessage(module.key)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {children.map((child) => {
            const colorCls = subColors[module.color] || subColors.emerald;
            const [bgCls, textCls] = colorCls.split(" ");
            return (
              <button
                key={child.key}
                onClick={() => router.push(child.href)}
                className="group flex flex-col items-center rounded-xl bg-white p-6 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-emerald-400"
              >
                <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full ${bgCls} ${textCls}`}>
                  <span className="text-2xl">{child.icon || "📌"}</span>
                </div>
                <h3 className="text-base font-semibold text-gray-800">{child.label}</h3>
                <p className="mt-1 text-xs text-gray-500">{child.desc}</p>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
