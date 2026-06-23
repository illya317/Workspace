import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { EmployeeProfilePageClient } from "@workspace/hr/ui";
import type { HRUser } from "@workspace/hr/types";

interface Props {
  params: Promise<{ id: string }>;
}

function toHRUser(user: Awaited<ReturnType<typeof requireRouteAccess>>): HRUser {
  return {
    id: user.id,
    name: user.employeeName || user.nickname,
    visibleResourceKeys: user.visibleResourceKeys || [],
    visibleWriteResourceKeys: user.visibleWriteResourceKeys || [],
    isAdmin: user.isSuperAdmin ?? false,
    company: user.company ?? null,
  };
}

export default async function EmployeeProfilePage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireRouteAccess("/hr/roster")]);
  const employeeKey = decodeURIComponent(id).trim();
  if (!employeeKey) notFound();

  return <EmployeeProfilePageClient employeeId={employeeKey} user={user} hrUser={toHRUser(user)} />;
}
