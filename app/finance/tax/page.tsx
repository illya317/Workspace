import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";

export default async function TaxPage() {
  const user = await requireResourceAccess("finance.tax");
  return (
    <AppShell title="税务管理" backHref="/finance" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-gray-400">税务管理——规划中</p>
          <p className="mt-2 text-xs text-gray-300">
            销项/进项、税负分析、发票管理、纳税申报辅助
          </p>
        </div>
      </main>
    </AppShell>
  );
}
