import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "./ApiGuideClient";

export default async function ApiGuideServerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="API 接入指南" backHref="/portal" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
