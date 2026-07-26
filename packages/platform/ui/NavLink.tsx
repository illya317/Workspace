"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { workspacePath } from "@workspace/core/routing";
import { useDeployUnitNavigation } from "./useDeployUnitNavigation";

export default function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const navigate = useDeployUnitNavigation();
  const isActive = pathname === href;
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    <a
      href={workspacePath(href)}
      onClick={handleClick}
      className={`text-sm ${isActive ? "font-medium text-emerald-600" : "text-gray-600 hover:underline"}`}
    >
      {children}
    </a>
  );
}
