import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, requireRouteAccess } from "../server/auth";
import type { SessionUser } from "../types";
import {
  renderAppShellPage,
  type AppShellNavLink,
} from "./app-shell-page";

interface PageRenderContext {
  user: SessionUser;
}

type PageTitle = string | ((context: PageRenderContext) => string);

interface ProtectedModulePageOptions {
  route: string;
  title: PageTitle;
  backHref?: string;
  backLabel?: string;
  navLinks?: AppShellNavLink[];
  render: (context: PageRenderContext) => ReactNode;
}

interface AuthenticatedAppShellPageOptions {
  title: PageTitle;
  backHref?: string;
  backLabel?: string;
  navLinks?: AppShellNavLink[];
  render: (context: PageRenderContext) => ReactNode;
}

function resolveTitle(title: PageTitle, context: PageRenderContext) {
  return typeof title === "function" ? title(context) : title;
}

export function createProtectedModulePage(options: ProtectedModulePageOptions) {
  return async function ProtectedModulePage() {
    const user = await requireRouteAccess(options.route);
    const context = { user };

    return renderAppShellPage({
      title: resolveTitle(options.title, context),
      backHref: options.backHref,
      backLabel: options.backLabel,
      navLinks: options.navLinks,
      user,
      children: options.render(context),
    });
  };
}

export function createAuthenticatedAppShellPage(options: AuthenticatedAppShellPageOptions) {
  return async function AuthenticatedAppShellPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const context = { user };

    return renderAppShellPage({
      title: resolveTitle(options.title, context),
      backHref: options.backHref,
      backLabel: options.backLabel,
      navLinks: options.navLinks,
      user,
      children: options.render(context),
    });
  };
}
