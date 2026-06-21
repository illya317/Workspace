import { redirect } from "next/navigation";
import { PageStyleShowcase, RegistryBrowserCard } from "@workspace/core/ui";
import type { CoreUiRegistryUsageRow, SessionUser } from "@workspace/platform/types";
import { getPageStyleRouteModules, pageViewDefinitions } from "@workspace/platform/view-registry";
import AppShell from "../AppShell";
import { DatabasePageFrame } from "@workspace/core/ui";
import SettingsClient from "./SettingsClient";
import { pageStylePreviewSamples } from "./page-style-sample-data";
import { getTemplateRoutes, moduleTemplates } from "./page-style-template-data";

export function SettingsAccountPage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="账号与接入" backHref="/settings" user={user}>
      <SettingsClient user={user} hideShell view="account" />
    </AppShell>
  );
}

export function SettingsGovernancePage({
  user,
}: {
  user: SessionUser;
}) {
  if ((user.manageableResourceKeys?.length ?? 0) === 0) redirect("/settings");

  return (
    <AppShell title="数据治理" backHref="/settings" user={user}>
      <SettingsClient user={user} hideShell view="governance" />
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
  if ((user.manageableResourceKeys?.length ?? 0) === 0) redirect("/settings");

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
  if ((user.manageableResourceKeys?.length ?? 0) === 0) redirect("/settings");
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
