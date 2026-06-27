import { createElement } from "react";
import type { SessionUser } from "@workspace/platform/types";
import { activeModuleDefinitions } from "@workspace/platform/effective-module-registry";
import AppShell from "../AppShell";
import SettingsClient from "./SettingsClient";
import SettingsApiClient from "./SettingsApiClient";
import UiComponentsShowcase from "@workspace/core/showcase/UiComponentsShowcase";
import { getCoreUiRegistryUsageRows } from "@workspace/platform/server/ui-registry";
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
  return createElement(
    AppShell,
    { title: "账号与接入", backHref: "/settings", user },
    <SettingsClient user={user} hideShell view="account" apiAccessModules={buildApiAccessModules()} />,
  );
}

export function SettingsApiPage({
  user,
  focusRegistrationKey,
}: {
  user: SessionUser;
  focusRegistrationKey?: string;
}) {
  return createElement(
    AppShell,
    { title: "API 接入", backHref: "/settings", user },
    <SettingsApiClient focusRegistrationKey={focusRegistrationKey} />,
  );
}

export function SettingsUiPage({ user }: { user: SessionUser }) {
  const usageRows = getCoreUiRegistryUsageRows().map((row) => ({
    name: row.name,
    usageFiles: row.usageFiles,
  }));

  return createElement(
    AppShell,
    { title: "UI 组件库", backHref: "/settings", user },
    <UiComponentsShowcase usageRows={usageRows} />,
  );
}
