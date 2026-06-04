import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";

export default async function TreasuryPage() {
  const user = await requireResourceAccess("finance.treasury");
  return (
    <AppShell title="司库管理" backHref="/finance" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-gray-400">司库管理——规划中</p>
          <p className="mt-2 text-xs text-gray-300">
            银行账户、资金日报、收付款计划、现金流预测、授信管理
          </p>
        </div>
      </main>
    </AppShell>
  );
}
