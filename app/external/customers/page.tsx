import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell title="客户管理" backHref="/external" user={user}>
      <CustomersClient />
    </AppShell>
  );
}
