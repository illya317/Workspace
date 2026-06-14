"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";
import type { ReactNode } from "react";

interface NavLinkDef { label: string; href: string; }

interface Props {
  title: string;
  backHref: string;
  backLabel?: string;
  /** 顶部栏的跨页导航链接（如工作汇报/工作清单/历史记录） */
  navLinks?: NavLinkDef[];
  user: SessionUser;
  children: ReactNode;
}

export default function AppShell({ title, backHref, backLabel, navLinks, user, children }: Props) {
  const router = useRouter();
  const backText = backLabel || "返回";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <nav className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          {/* Logo */}
          <button onClick={() => router.push("/portal")} className="flex-shrink-0">
            <Image
              src="/workspace/company/logo.png"
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

          {/* Cross-page nav links */}
          {navLinks?.map((l) => (
            <button key={l.href} onClick={() => router.push(l.href)}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700">
              {l.label}
            </button>
          ))}

          {/* Back */}
          <button
            onClick={() => router.push(backHref)}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
          >
            {backText}
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
