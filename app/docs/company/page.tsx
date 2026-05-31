import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";

export default async function DocsCompanyPage() {
  const user = await requireResourceAccess("docs.company");
  return (
    <AppShell title="公司管理" backHref="/docs" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">公司管理</h2>
        <p className="text-sm text-gray-500">员工手册、管理手册等文档将在此发布。</p>
      </main>
    </AppShell>
  );
}
