"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = user?.employeeName || user?.nickname;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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

  function handleSettingsSelect() {
    setOpen(false);
    void navigate("/settings");
  }

  function handleLogoutSelect() {
    setOpen(false);
    void handleLogout();
  }

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        onClick={() => setOpen((current) => !current)}
      >
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
        <span
          className={`text-xs leading-none text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          v
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="用户菜单"
          className="absolute right-0 z-50 mt-2 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            onClick={handleSettingsSelect}
          >
            设置
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 focus:bg-red-50 focus:outline-none"
            onClick={handleLogoutSelect}
          >
            登出
          </button>
        </div>
      ) : null}
    </div>
  );
}
