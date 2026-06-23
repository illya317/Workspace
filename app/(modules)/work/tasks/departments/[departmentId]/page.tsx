import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { WorksClient } from "@workspace/work/ui";

export default async function WorkTasksDepartmentPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const user = await requireRouteAccess("/work/tasks");
  const { departmentId } = await params;

  return (
    <AppShell title="工作计划" backHref="/work" user={user}>
      <WorksClient
        user={user}
        initialTarget={{ targetType: "department", targetId: Number(departmentId) }}
      />
    </AppShell>
  );
}
