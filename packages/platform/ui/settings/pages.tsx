import { DatabasePageFrame, PageStyleShowcase, RegistryBrowserCard } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { CoreUiRegistryUsageRow } from "@workspace/platform/types";
import { activeModuleDefinitions } from "@workspace/platform/effective-module-registry";
import { getPageStyleRouteModules, pageViewDefinitions } from "@workspace/platform/view-registry";
import AppShell from "../AppShell";
import SettingsClient from "./SettingsClient";
import SettingsApiClient from "./SettingsApiClient";
import { type ApiAccessModuleRow } from "./ApiAccessClient";
import { pageStylePreviewSamples } from "./page-style-sample-data";
import { getTemplateRoutes, moduleTemplates } from "./page-style-template-data";

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

export function SettingsGovernancePage({
  user,
}: {
  user: SessionUser;
}) {
  return (
    <AppShell title="数据治理" backHref="/settings" user={user}>
      <SettingsClient user={user} hideShell view="governance" />
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

export function SettingsGovernanceUiRegistryPage({
  user,
  coreUiRegistryRows,
}: {
  user: SessionUser;
  coreUiRegistryRows: CoreUiRegistryUsageRow[];
}) {
  return (
    <AppShell title="Core UI 注册表" backHref="/settings/governance" user={user}>
      <DatabasePageFrame contentClassName="py-8">
        <RegistryBrowserCard
          title="Core UI 注册表（除了 FK Registry）"
          subtitle="自动读取 Core UI 注册表、中文分类说明和当前消费文件。"
          items={coreUiRegistryRows}
        />
      </DatabasePageFrame>
    </AppShell>
  );
}

export function SettingsGovernanceToolbarPreviewPage({
  user,
}: {
  user: SessionUser;
}) {
  const templateRoutesByModule = new Map(
    moduleTemplates.map((module) => [module.key, new Set(getTemplateRoutes(module))]),
  );
  const routeModules = getPageStyleRouteModules()
    .map((module) => ({
      ...module,
      children: module.children.filter((child) => templateRoutesByModule.get(module.key)?.has(child.route)),
    }))
    .filter((module) => module.children.length > 0);

  return (
    <AppShell title="页面样式预览" backHref="/settings/governance" user={user}>
      <PageStyleShowcase
        modules={moduleTemplates}
        routeModules={routeModules}
        viewDefinitions={pageViewDefinitions}
        samples={pageStylePreviewSamples}
      />
    </AppShell>
  );
}
