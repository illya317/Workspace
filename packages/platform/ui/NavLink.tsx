"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      className={`text-sm ${isActive ? "font-medium text-emerald-600" : "text-gray-600 hover:underline"}`}
    >
      {children}
    </Link>
  );
}
