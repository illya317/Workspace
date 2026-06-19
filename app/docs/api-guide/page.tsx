import { requireAuth } from "@/server/auth/session";
import { DocsApiGuidePage as PlatformDocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function DocsApiGuidePage() {
  const user = await requireAuth();
  return <PlatformDocsApiGuidePage user={user} />;
}
