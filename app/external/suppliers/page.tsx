import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import SuppliersClient from "./SuppliersClient";

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="供应商管理" backHref="/external" user={user}>
      <SuppliersClient />
    </AppShell>
  );
}
