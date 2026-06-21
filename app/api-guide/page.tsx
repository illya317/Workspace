import { requireResourceAccess } from "@workspace/platform/server/auth";
import { DocsApiGuidePage } from "@workspace/platform/ui/docs";

export default async function ApiGuideServerPage() {
  const user = await requireResourceAccess("system.api");
  return <DocsApiGuidePage user={user} />;
}
