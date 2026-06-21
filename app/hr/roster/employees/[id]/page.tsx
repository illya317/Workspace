import { notFound } from "next/navigation";
import AppShell from "@workspace/platform/ui/AppShell";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { EmployeeProfileClient } from "@workspace/hr/ui";
import type { HRUser } from "@workspace/hr/types";

interface Props {
  params: Promise<{ id: string }>;
}

function toHRUser(user: Awaited<ReturnType<typeof requireResourceAccess>>): HRUser {
  return {
    id: user.id,
    name: user.name,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default async function EmployeeProfilePage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireResourceAccess("people.roster")]);
  const employeeKey = decodeURIComponent(id).trim();
  if (!employeeKey) notFound();

  return (
    <AppShell title="员工资料" backHref="/hr/roster" user={user}>
      <EmployeeProfileClient employeeId={employeeKey} user={toHRUser(user)} />
    </AppShell>
  );
}
