"use client";

import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { getSubModules, getEmptyMessage, type ModuleDef } from "@/app/lib/module-nav";

interface Props {
  module: ModuleDef;
  user: SessionUser;
}

/**
 * 统一的 L1 模块首页卡片网格。
 * 根据 module-nav.ts 注册表渲染子板块卡片，自动按权限过滤。
 * 如果一个子板块都不可见，显示 empty message。
 */
export default function ModuleHome({ module, user }: Props) {
  const router = useRouter();
  const children = getSubModules(user, module.key);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-800">{module.label}</h1>
      <p className="mb-6 text-sm text-gray-500">{module.desc}</p>

      {children.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-400">{getEmptyMessage(module.key)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <button
              key={child.key}
              onClick={() => router.push(child.href)}
              className="cursor-pointer rounded-lg bg-white p-5 text-left shadow-sm transition hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-gray-800">{child.label}</h3>
              <p className="mt-1 text-sm text-gray-500">{child.desc}</p>
              <span className="mt-3 inline-block text-sm text-emerald-600">进入 →</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
