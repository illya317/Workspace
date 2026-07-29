import { AgentHomePage as AgentHomePageView } from "@workspace/agent/ui";
import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function AgentHomePage() {
  const user = await requireRouteAccess("/agent");
  return AgentHomePageView({ user });
}
