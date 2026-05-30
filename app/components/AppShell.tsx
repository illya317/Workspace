"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";
import type { ReactNode } from "react";

interface Props {
  /** 当前页面标题 */
  title: string;
  /** 返回目标路径 */
  backHref: string;
  /** 返回按钮文字，默认"返回上一级" */
  backLabel?: string;
  user: SessionUser;
  children: ReactNode;
}

/**
 * 全站统一的 L2 子页面顶部栏。
 * 替代各模块手写的 <nav className="bg-white shadow-sm"> 模式。
 *
 * 固定布局: [Logo] | 当前标题 | spacer | [返回上一级] | [UserMenu]
 */
export default function AppShell({ title, backHref, backLabel, user, children }: Props) {
  const router = useRouter();
  const backText = backLabel || "返回上一级";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <nav className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          {/* Logo */}
          <button onClick={() => router.push("/portal")} className="flex-shrink-0">
            <Image
              src="/company/logo.png"
              alt="Logo"
              width={28}
              height={28}
              className="h-7 w-auto object-contain"
            />
          </button>

          {/* Separator */}
          <span className="text-gray-300">|</span>

          {/* Current page title */}
          <span className="text-sm font-medium text-gray-700">{title}</span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Back */}
          <button
            onClick={() => router.push(backHref)}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
          >
            ← {backText}
          </button>

          {/* User menu */}
          <UserMenu user={user} />
        </div>
      </nav>

      {/* Content */}
      {children}
    </div>
  );
}
