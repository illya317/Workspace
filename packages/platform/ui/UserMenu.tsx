"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu } from "@workspace/core/ui";
import type { SessionUser } from "../types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

export default function UserMenu({
  user,
  onBeforeNavigate,
}: {
  user: SessionUser | null;
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
}) {
  const router = useRouter();
  const displayName = user?.employeeName || user?.nickname;

  async function navigate(href: string) {
    if (onBeforeNavigate && !(await onBeforeNavigate(href))) return;
    router.push(href);
  }

  async function handleLogout() {
    if (onBeforeNavigate && !(await onBeforeNavigate("/login"))) return;
    await fetch(`${BASE_PATH}/api/auth/dev-login`, { method: "DELETE" }).catch(() => {});
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/login");
  }

  return (
    <DropdownMenu
      ariaLabel="用户菜单"
      trigger={
        <>
        {user?.avatar ? (
          <span
            className="h-7 w-7 rounded-full bg-cover bg-center"
            style={{ backgroundImage: `url(${user.avatar})` }}
            aria-hidden="true"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-medium text-emerald-700">
            {displayName?.slice(0, 1) || "?"}
          </span>
        )}
        <span>{displayName}</span>
        </>
      }
      items={[
        { label: "设置", onSelect: () => void navigate("/settings") },
        { label: "登出", tone: "danger", separatorBefore: true, onSelect: handleLogout },
      ]}
    />
  );
}
