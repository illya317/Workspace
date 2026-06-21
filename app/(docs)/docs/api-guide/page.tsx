import { requireAnyResourceAccess } from "@workspace/platform/server/auth";
import { DocsApiGuidePage as PlatformDocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function DocsApiGuidePage() {
  const user = await requireAnyResourceAccess(["docs.api", "settings.api"]);
  return <PlatformDocsApiGuidePage user={user} />;
}
