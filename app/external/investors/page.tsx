import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import InvestorsClient from "./InvestorsClient";

export default async function InvestorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="投资人关系" backHref="/external" user={user}>
      <InvestorsClient />
    </AppShell>
  );
}
