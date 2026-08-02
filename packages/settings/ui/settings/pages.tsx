import type { SessionUser } from "@workspace/platform/types";
import { activeModuleDefinitions } from "@workspace/platform/effective-module-registry";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import SettingsClient from "./SettingsClient";
import SettingsApiClient from "./SettingsApiClient";
import { type ApiAccessModuleRow } from "./ApiAccessClient";
import PlatformGovernanceClient from "../governance/PlatformGovernanceClient";

function buildApiAccessModules(): ApiAccessModuleRow[] {
  const modules: ApiAccessModuleRow[] = activeModuleDefinitions
    .flatMap((definition) => {
      const moduleDef = definition.moduleDef;
      if (!moduleDef || moduleDef.hidden || moduleDef.enabled === false) return [];
      return [{
        key: moduleDef.key,
        label: moduleDef.label,
        apiPrefix: moduleDef.key === "settings" ? "/api/settings/<l2>/*" : `/api/modules/${moduleDef.key}/<l2-kebab>/*`,
        children: (moduleDef.children ?? [])
          .filter((child) => !child.hidden && child.enabled !== false)
          .map((child) => ({
            key: child.key,
            label: child.label,
            resourceKey: child.resourceKey,
            apiPrefixes: child.apiPrefixes ?? [],
            noApiReason: child.noApiReason,
          })),
      }];
    });

  return modules;
}

export function SettingsAccountPage({ user }: { user: SessionUser }) {
  return renderAppShellPage({
    title: "账号与接入",
    backHref: "/settings",
    user,
    children: <SettingsClient user={user} hideShell apiAccessModules={buildApiAccessModules()} />,
  });
}

export function SettingsApiPage({
  user,
  canCreateClient = false,
  canRotateSecret = false,
  canGrantScopes = false,
  canAccessNotifications = false,
}: {
  user: SessionUser;
  canCreateClient?: boolean;
  canRotateSecret?: boolean;
  canGrantScopes?: boolean;
  canAccessNotifications?: boolean;
}) {
  return renderAppShellPage({
    title: "API 接入",
    backHref: "/settings",
    user,
    children: <SettingsApiClient canCreateClient={canCreateClient} canRotateSecret={canRotateSecret} canGrantScopes={canGrantScopes} canAccessNotifications={canAccessNotifications} />,
  });
}

export function SettingsGovernancePage({ user, canAuditOperations = false }: { user: SessionUser; canAuditOperations?: boolean }) {
  return renderAppShellPage({
    title: "平台治理",
    backHref: "/settings",
    user,
    children: <PlatformGovernanceClient isSuperAdmin={Boolean(user.isSuperAdmin)} canAuditOperations={canAuditOperations} />,
  });
}
