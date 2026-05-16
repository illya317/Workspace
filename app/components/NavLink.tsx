"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
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
