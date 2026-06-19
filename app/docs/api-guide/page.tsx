import { requireAuth } from "@workspace/platform/server/auth";
import { DocsApiGuidePage as PlatformDocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function DocsApiGuidePage() {
  const user = await requireAuth();
  return <PlatformDocsApiGuidePage user={user} />;
}
