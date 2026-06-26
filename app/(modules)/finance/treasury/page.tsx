import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { PageSurface } from "@workspace/core/ui";

export default async function TreasuryPage() {
  const user = await requireRouteAccess("/finance/treasury");
  return (
    <AppShell title="司库管理" backHref="/finance" user={user}>
      <PageSurface kind="list" blocks={[
        { kind: "section", key: "treasury", title: "司库管理", subtitle: "银行账户、资金日报、收付款计划、现金流预测、授信管理", blocks: [
          { kind: "data", key: "empty", surface: { kind: "records", records: [], empty: "司库管理规划中" } },
        ] },
      ]} />
    </AppShell>
  );
}
