"use client";

import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import type { SessionUser } from "../types";

export default function UserMenu({
  user,
  onBeforeNavigate,
  variant = "icon",
}: {
  user: SessionUser | null;
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
  variant?: "icon" | "nav";
}) {
  const router = useRouter();
  const displayName = user?.employeeName || user?.username;

  async function openAccountProfile() {
    const href = "/settings/account?tab=profile";
    if (onBeforeNavigate && !(await onBeforeNavigate(href))) return;
    window.dispatchEvent(new CustomEvent("account-settings-tab", { detail: "profile" }));
    router.push(href);
  }

  return (
    <button
      type="button"
      aria-label="账户资料"
      className={variant === "nav"
        ? "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500 transition active:text-slate-900"
        : "inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-gray-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"}
      onClick={() => void openAccountProfile()}
    >
      {variant === "nav" ? (
        <>
          <span className="flex h-7 min-w-12 items-center justify-center rounded-full px-3">
            <UserRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <span>我的</span>
        </>
      ) : user?.avatar ? (
        <span
          className="h-9 w-9 rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${user.avatar})` }}
          aria-hidden="true"
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
          {displayName?.slice(0, 1) || "?"}
        </span>
      )}
    </button>
  );
}
