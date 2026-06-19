import { requireAuth } from "@/server/auth/session";
import { GmpPositionsPage as PlatformGmpPositionsPage } from "@workspace/platform/ui/docs";

export default async function GmpPositionsPage() {
  const user = await requireAuth();
  return <PlatformGmpPositionsPage user={user} />;
}
