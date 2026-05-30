import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import DocsClient from "./DocsClient";

export default async function DocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="文档中心" backHref="/portal" user={user}>
      <DocsClient user={user} hideShell />
    </AppShell>
  );
}
