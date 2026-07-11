"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { workspaceBasePath, workspacePath } from "@workspace/core/routing";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { NavigationContextSelector, useFeedback, type NavigationSurfaceSelectorSpec } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { PortalSlot } from "../portal-preferences";
import {
  fetchPortalSlotSettings,
  headerShortcutsForUser,
} from "./portal-preferences";
interface NavLinkDef {
  label: string;
  href: string;
}

const DESKTOP_MODE_LINKS = [
  { key: "personalized", label: "我的桌面", href: "/portal?desktop=personalized" },
  { key: "default", label: "默认桌面", href: "/portal?desktop=default" },
];

interface Props {
  title: string;
  backHref?: string;
  backLabel?: string;
  /** 顶部栏的跨页导航链接（如工作汇报/工作计划/历史记录） */
  navLinks?: NavLinkDef[];
  headerSelector?: NavigationSurfaceSelectorSpec | null;
  hasUnsavedChanges?: boolean;
  user: SessionUser;
  children?: ReactNode;
}
export default function AppShell({
  title,
  backHref,
  backLabel,
  navLinks,
  headerSelector,
  hasUnsavedChanges = false,
  user,
  children
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const feedback = useFeedback({ unsavedChanges: hasUnsavedChanges });
  const [portalSlots, setPortalSlots] = useState<PortalSlot[]>([]);
  const headerShortcuts = headerShortcutsForUser(user, portalSlots);
  const currentPath = workspaceBasePath && pathname.startsWith(`${workspaceBasePath}/`)
    ? pathname.slice(workspaceBasePath.length)
    : pathname;
  const showDesktopModeSwitch = currentPath === "/portal" || currentPath === "/settings" || currentPath.startsWith("/settings/");
  const activeDesktopMode = "personalized";
  async function navigate(href: string) {
    if (!(await feedback.confirmLeave())) return;
    router.push(href);
  }
  useEffect(() => {
    let cancelled = false;
    fetchPortalSlotSettings()
      .then((settings) => {
        if (!cancelled) setPortalSlots(settings.slots);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            onClick={() => void navigate("/portal")}
            className="flex-shrink-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
          >
            <Image
              src={workspacePath("/company/logo.png")}
              alt="Logo"
              width={76}
              height={28}
              loading="eager"
              className="h-7 w-auto object-contain"
            />
          </button>
          <span className="text-gray-300">|</span>
          {headerSelector ? (
            <NavigationContextSelector selector={headerSelector} />
          ) : null}
          {title ? <span className="text-sm font-medium text-gray-700">{title}</span> : null}
          {showDesktopModeSwitch && (
            <Suspense fallback={<DesktopModeSwitchFallback activeMode={activeDesktopMode} />}>
              <DesktopModeSwitch onNavigate={navigate} activePathMode={activeDesktopMode} />
            </Suspense>
          )}
          {headerShortcuts.map(({ entry }) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => void navigate(entry.href)}
              className="hidden rounded-md px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 lg:inline-flex"
            >
              {entry.label}
            </button>
          ))}
          {backHref && (
            <button
              type="button"
              onClick={() => void navigate(backHref)}
              className="rounded-md px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            >
              {backLabel ?? "返回"}
            </button>
          )}
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

function DesktopModeSwitchFallback({ activeMode }: { activeMode: string }) {
  const target = desktopModeTarget(activeMode);
  return (
    <span className="hidden rounded-md px-2.5 py-1.5 text-sm text-gray-500 lg:inline-flex">
      {target.label}
    </span>
  );
}

function DesktopModeSwitch({
  onNavigate,
  activePathMode,
}: {
  onNavigate: (href: string) => Promise<void>;
  activePathMode: string;
}) {
  const searchParams = useSearchParams();
  const activeMode = searchParams.get("desktop") === "default" ? "default" : activePathMode;
  const target = desktopModeTarget(activeMode);
  return (
    <button
      type="button"
      onClick={() => void onNavigate(target.href)}
      className="hidden rounded-md px-2.5 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 lg:inline-flex"
    >
      {target.label}
    </button>
  );
}

function desktopModeTarget(activeMode: string) {
  return activeMode === "default"
    ? DESKTOP_MODE_LINKS[0]
    : DESKTOP_MODE_LINKS[1];
}
