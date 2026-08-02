import { createElement, type ReactNode } from "react";
import type { NavigationSurfaceSelectorSpec } from "@workspace/core/ui";
import type { PortalSlot } from "../portal-preferences";
import type { SessionUser } from "../types";
import AppShell from "./AppShell";

export interface AppShellNavLink {
  label: string;
  href: string;
}

export interface AppShellPageProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  navLinks?: AppShellNavLink[];
  headerSelector?: NavigationSurfaceSelectorSpec | null;
  hasUnsavedChanges?: boolean;
  initialPortalSlots?: PortalSlot[];
  user: SessionUser;
  children?: ReactNode;
}

export function renderAppShellPage({
  children,
  ...shellProps
}: AppShellPageProps) {
  return createElement(AppShell, shellProps, children);
}
