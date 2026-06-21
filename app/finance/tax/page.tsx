import { requireResourceAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { EmptyStateCard, ModuleGridPage } from "@workspace/core/ui";

export default async function TaxPage() {
  const user = await requireResourceAccess("finance.tax");
  return (
    <AppShell title="税务管理" backHref="/finance" user={user}>
      <ModuleGridPage title="税务管理" summary="销项/进项、税负分析、发票管理、纳税申报辅助" centered>
        <div className="col-span-full">
          <EmptyStateCard>
            <span className="block">税务管理规划中</span>
          </EmptyStateCard>
        </div>
      </ModuleGridPage>
    </AppShell>
  );
}
