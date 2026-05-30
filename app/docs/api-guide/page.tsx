import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "@/app/api-guide/ApiGuideClient";

export default async function DocsApiGuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell title="API 接入指南" backHref="/docs" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
