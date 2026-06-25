import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsPositionsPage } from "@workspace/platform/ui/docs";

export default async function DocsPositionsRoute() {
  const user = await requireRouteAccess("/docs/positions");
  return <DocsPositionsPage user={user} />;
}
