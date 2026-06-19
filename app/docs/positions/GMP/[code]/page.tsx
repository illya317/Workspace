import { requireAuth } from "@workspace/platform/server/auth";
import { GmpPositionDetailPage as PlatformGmpPositionDetailPage } from "@workspace/platform/ui/docs";

export default async function GmpPositionDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireAuth();
  return <PlatformGmpPositionDetailPage code={code} user={user} />;
}
