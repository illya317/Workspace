import { requireAuth } from "@/server/auth/session";
import { DocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function ApiGuideServerPage() {
  const user = await requireAuth();
  return <DocsApiGuidePage user={user} />;
}
