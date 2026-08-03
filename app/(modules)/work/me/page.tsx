import { requireRouteAccess } from "@workspace/platform/server/auth";
import { WorkPersonalHomePageView } from "@workspace/work/ui";

export default async function WorkMePage() {
  const user = await requireRouteAccess("/work/me");
  return <WorkPersonalHomePageView
    user={user}
    contributions={[{
      key: "business-analysis",
      label: "经营分析",
      order: 100,
      href: `/finance/cost/workspace/personal/${user.id}`,
    }]}
  />;
}
