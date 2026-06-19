import { requireAuth } from "@workspace/platform/server/auth";
import { DocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function ApiGuideServerPage() {
  const user = await requireAuth();
  return <DocsApiGuidePage user={user} />;
}
