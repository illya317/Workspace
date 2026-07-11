import { requireRouteAccess } from "@workspace/platform/server/auth";
import { emptyWorkDepartmentHomeData, getDepartmentHomeEntry, listWorkTaskSpaces } from "@workspace/work/server";
import { WorkDepartmentHomePageView } from "@workspace/work/ui";

export default async function WorkDepartmentHomePage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const user = await requireRouteAccess("/work/me");
  const { departmentId } = await params;
  const [entry, navigation] = await Promise.all([
    getDepartmentHomeEntry({ userId: user.id, departmentId: Number(departmentId) }),
    listWorkTaskSpaces(user.id),
  ]);
  return <WorkDepartmentHomePageView
    user={user}
    data={entry.ok ? entry.data : emptyWorkDepartmentHomeData()}
    navigation={navigation}
  />;
}
