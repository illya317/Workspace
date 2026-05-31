import { requireCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import GmpDetailClient from "./GmpDetailClient";

export default async function GmpPositionDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireCurrentUser();
  return (
    <AppShell title="岗位说明书" backHref="/docs/positions/GMP" user={user}>
      <GmpDetailClient code={code} />
    </AppShell>
  );
}
