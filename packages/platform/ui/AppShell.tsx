"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { FormSurface, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import type { ReactNode } from "react";
interface NavLinkDef {
  label: string;
  href: string;
}
interface Props {
  title: string;
  backHref?: string;
  backLabel?: string;
  /** 顶部栏的跨页导航链接（如工作汇报/工作计划/历史记录） */
  navLinks?: NavLinkDef[];
  hasUnsavedChanges?: boolean;
  user: SessionUser;
  children?: ReactNode;
}
export default function AppShell({
  title,
  backHref,
  backLabel,
  navLinks,
  hasUnsavedChanges = false,
  user,
  children
}: Props) {
  const router = useRouter();
  const feedback = useFeedback({ unsavedChanges: hasUnsavedChanges });
  async function navigate(href: string) {
    if (!(await feedback.confirmLeave())) return;
    router.push(href);
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <FormSurface
            kind="inline"
            actions={[
              {
                key: "portal",
                label: (
                  <Image
                    src={workspacePath("/company/logo.png")}
                    alt="Logo"
                    width={28}
                    height={28}
                    className="h-7 w-auto object-contain"
                  />
                ),
                onClick: () => void navigate("/portal"),
                className: "flex-shrink-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent",
              },
            ]}
          />
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <div className="flex-1" />

          {navLinks?.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={() => void navigate(link.href)}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            >
              {link.label}
            </button>
          ))}

          {backHref && (
            <button
              type="button"
              onClick={() => void navigate(backHref)}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-800"
            >
              {backLabel ?? "返回"}
            </button>
          )}

          <div className="flex items-center gap-2">
            <NotificationBell onBeforeNavigate={() => feedback.confirmLeave()} />
            <UserMenu user={user} onBeforeNavigate={() => feedback.confirmLeave()} />
          </div>
        </div>
      </nav>

      {children}
    </div>
  );
}
