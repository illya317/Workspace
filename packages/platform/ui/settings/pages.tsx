import { redirect } from "next/navigation";
import { PageContent, RegistryBrowserCard } from "@workspace/core/ui";
import type { CoreUiRegistryUsageRow, SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";
import SettingsClient from "./SettingsClient";

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
      <PageContent className="py-8">
        <RegistryBrowserCard
          title="Core UI 注册表（除了 FK Registry）"
          subtitle="自动读取 Core UI 注册表、中文分类说明和当前消费文件。"
          items={coreUiRegistryRows}
        />
      </PageContent>
    </AppShell>
  );
}
