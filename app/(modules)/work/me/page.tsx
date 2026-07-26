import { requireRouteAccess } from "@workspace/platform/server/auth";
import { listWorkTaskSpaces } from "@workspace/work/server";
import { WorkPersonalHomePageView } from "@workspace/work/ui";

export default async function WorkMePage() {
  const user = await requireRouteAccess("/work/me");
  const navigation = await listWorkTaskSpaces(user.id);
  return <WorkPersonalHomePageView
    user={user}
    navigation={navigation}
    contributions={[{
      key: "business-analysis",
      label: "经营分析",
      order: 100,
      href: `/finance/cost/workspace/personal/${user.id}`,
    }]}
  />;
}
