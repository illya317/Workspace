import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "./ApiGuideClient";

export default async function ApiGuideServerPage() {
  const user = await requireAuth();
  return (
    <AppShell title="接入指南" backHref="/portal" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
