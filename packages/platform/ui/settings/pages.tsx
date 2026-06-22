import type { SessionUser } from "@workspace/platform/types";
import { activeModuleDefinitions } from "@workspace/platform/effective-module-registry";
import AppShell from "../AppShell";
import SettingsClient from "./SettingsClient";
import SettingsApiClient from "./SettingsApiClient";
import { type ApiAccessModuleRow } from "./ApiAccessClient";

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
  return (
    <AppShell title="账号与接入" backHref="/settings" user={user}>
      <SettingsClient user={user} hideShell view="account" apiAccessModules={buildApiAccessModules()} />
    </AppShell>
  );
}

export function SettingsApiPage({
  user,
  focusRegistrationKey,
}: {
  user: SessionUser;
  focusRegistrationKey?: string;
}) {
  return (
    <AppShell title="API 接入" backHref="/settings" user={user}>
      <SettingsApiClient focusRegistrationKey={focusRegistrationKey} />
    </AppShell>
  );
}
