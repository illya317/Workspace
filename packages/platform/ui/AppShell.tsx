"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Home } from "lucide-react";
import { workspaceBasePath, workspacePath } from "@workspace/core/routing";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { ActionGlyph, NavigationContextSelector, useFeedback, type NavigationSurfaceSelectorSpec } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { PortalSlot } from "../portal-preferences";
import {
  fetchPortalSlotSettings,
  defaultSlotsForUser,
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
  const [portalSlots, setPortalSlots] = useState<PortalSlot[]>(() => defaultSlotsForUser(user));
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
    <div className="min-h-screen bg-slate-50 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:pb-0">
      <nav className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => void navigate("/portal")}
            className="flex flex-shrink-0 items-center border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
          >
            <Image
              src={workspacePath("/company/logo.png")}
              alt="Logo"
              width={76}
              height={28}
              loading="eager"
              className="object-contain"
            />
          </button>
          <span className="hidden text-gray-300 sm:inline">|</span>
          {headerSelector ? (
            <div className="min-w-0 max-w-[7.5rem] sm:max-w-none"><NavigationContextSelector selector={headerSelector} /></div>
          ) : null}
          {title ? <span className="min-w-0 max-w-24 truncate text-sm font-medium text-gray-700 sm:max-w-none">{title}</span> : null}
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
              aria-label={backLabel ?? "返回"}
              onClick={() => void navigate(backHref)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1.5"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">{backLabel ?? "返回"}</span>
            </button>
          )}
          <div className="flex-1" />

          {navLinks?.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={() => void navigate(link.href)}
              className="hidden rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 sm:inline-flex"
            >
              {link.label}
            </button>
          ))}

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <NotificationBell onBeforeNavigate={() => feedback.confirmLeave()} />
            <UserMenu user={user} onBeforeNavigate={() => feedback.confirmLeave()} />
          </div>
        </div>
        {navLinks?.length ? (
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 pb-2 sm:hidden">
            {navLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => void navigate(link.href)}
                className="h-9 shrink-0 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm"
              >
                {link.label}
              </button>
            ))}
          </div>
        ) : null}
      </nav>

      {children}

      <nav
        aria-label="移动端主导航"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-flow-col auto-cols-fr items-stretch px-2">
          <MobileNavButton
            label="桌面"
            active={currentPath === "/portal"}
            onClick={() => void navigate("/portal")}
            icon={<Home aria-hidden="true" className="h-5 w-5" />}
          />
          {headerShortcuts.map(({ entry }) => (
            <MobileNavButton
              key={entry.key}
              label={entry.label}
              active={currentPath === entry.href || currentPath.startsWith(`${entry.href}/`)}
              onClick={() => void navigate(entry.href)}
              icon={entry.icon ?? <ActionGlyph kind="link" className="h-5 w-5" />}
            />
          ))}
          {Array.from({ length: Math.max(0, 2 - headerShortcuts.length) }, (_, index) => (
            <MobileNavButton
              key={`empty-shortcut-${index}`}
              label="设置快捷"
              active={false}
              onClick={() => void navigate("/settings/account")}
              icon={<ActionGlyph kind="add" className="h-5 w-5" />}
            />
          ))}
          <NotificationBell variant="nav" onBeforeNavigate={() => feedback.confirmLeave()} />
          <UserMenu variant="nav" user={user} onBeforeNavigate={() => feedback.confirmLeave()} />
        </div>
      </nav>
    </div>
  );
}

function MobileNavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${active ? "text-emerald-700" : "text-slate-500 active:text-slate-900"}`}
    >
      <span className={`flex h-7 min-w-12 items-center justify-center rounded-full px-3 transition ${active ? "bg-emerald-50" : ""}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function DesktopModeSwitchFallback({ activeMode }: { activeMode: string }) {
  const target = desktopModeTarget(activeMode);
  return (
    <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 sm:text-sm">
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
      aria-label={`切换到${target.label}`}
      onClick={() => void onNavigate(target.href)}
      className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 sm:text-sm"
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
