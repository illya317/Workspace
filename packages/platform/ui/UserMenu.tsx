"use client";

import { useRouter } from "next/navigation";
import type { SessionUser } from "../types";

export default function UserMenu({
  user,
  onBeforeNavigate,
}: {
  user: SessionUser | null;
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-gray-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      onClick={() => void openAccountProfile()}
    >
      {user?.avatar ? (
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
