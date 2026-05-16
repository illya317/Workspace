"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  name: string;
  company?: string | null;
  departmentName?: string | null;
}

export default function UserMenu({ user }: { user: User | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/dev-login", { method: "DELETE" }).catch(() => {});
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/login");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
      >
        <span>{user?.name}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            设置
          </button>
          <div className="mx-2 my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              setOpen(false);
              handleLogout();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}
