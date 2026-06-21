import { requireResourceAccess } from "@workspace/platform/server/auth";
import { GmpPositionDetailPage as PlatformGmpPositionDetailPage } from "@workspace/platform/ui/docs";

export default async function GmpPositionDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireResourceAccess("docs.positions");
  return <PlatformGmpPositionDetailPage code={code} user={user} />;
}
