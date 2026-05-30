import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";

export default async function DocsExpensePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="报销规范" backHref="/docs" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">报销规范</h2>
        <p className="text-sm text-gray-500">报销流程与标准将在此发布。</p>
      </main>
    </AppShell>
  );
}
