import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "@/app/api-guide/ApiGuideClient";

export default async function DocsApiGuidePage() {
  const user = await requireResourceAccess("system.api");
  return (
    <AppShell title="接入指南" backHref="/docs" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
