import { requireCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import ApiGuidePage from "./ApiGuideClient";

export default async function ApiGuideServerPage() {
  const user = await requireCurrentUser();
  return (
    <AppShell title="接入指南" backHref="/portal" user={user}>
      <ApiGuidePage hideShell />
    </AppShell>
  );
}
