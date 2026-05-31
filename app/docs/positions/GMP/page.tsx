import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import GmpClient from "./GmpClient";

export default async function GmpPositionsPage() {
  const user = await requireResourceAccess("docs.positions");
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <GmpClient hideShell />
    </AppShell>
  );
}
