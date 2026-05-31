import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "@/app/api-guide/ApiGuideClient";

export default async function DocsApiGuidePage() {
  const user = await requireAuth();
  return (
    <AppShell title="接入指南" backHref="/docs" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
