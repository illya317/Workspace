import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import Link from "next/link";

export default async function DocsPositionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">岗位说明书</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/docs/positions/GMP" className="rounded-lg bg-white p-5 shadow-sm transition hover:shadow-md">
            <h3 className="text-base font-semibold text-gray-800">GMP 岗位说明书</h3>
            <p className="mt-1 text-sm text-gray-500">GMP 体系岗位说明书</p>
            <span className="mt-3 inline-block text-sm text-emerald-600">查看 →</span>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
