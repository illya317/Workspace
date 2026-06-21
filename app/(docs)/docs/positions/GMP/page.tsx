import { requireResourceAccess } from "@workspace/platform/server/auth";
import { GmpPositionsPage as PlatformGmpPositionsPage } from "@workspace/platform/ui/docs";

export default async function GmpPositionsPage() {
  const user = await requireResourceAccess("docs.positions");
  return <PlatformGmpPositionsPage user={user} />;
}
