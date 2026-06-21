import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { EmptyStateCard, ModuleGridPage } from "@workspace/core/ui";

export default async function TreasuryPage() {
  const user = await requireRouteAccess("/finance/treasury");
  return (
    <AppShell title="司库管理" backHref="/finance" user={user}>
      <ModuleGridPage title="司库管理" summary="银行账户、资金日报、收付款计划、现金流预测、授信管理" centered>
        <div className="col-span-full">
          <EmptyStateCard>
            <span className="block">司库管理规划中</span>
          </EmptyStateCard>
        </div>
      </ModuleGridPage>
    </AppShell>
  );
}
