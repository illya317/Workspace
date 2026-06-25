import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsPositionDetailPage } from "@workspace/platform/ui/docs";

export default async function DocsPositionDetailRoute({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireRouteAccess("/docs/positions");
  return <DocsPositionDetailPage code={code} user={user} />;
}
