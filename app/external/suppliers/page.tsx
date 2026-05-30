import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="rounded-lg bg-white py-16 text-center shadow-sm">
          <p className="text-gray-500">供应商管理模块开发中</p>
        </div>
      </main>
    </AppShell>
  );
}
