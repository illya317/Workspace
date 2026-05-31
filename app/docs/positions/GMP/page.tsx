import { requireAuth } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import GmpClient from "./GmpClient";

export default async function GmpPositionsPage() {
  const user = await requireAuth();
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <GmpClient hideShell />
    </AppShell>
  );
}
