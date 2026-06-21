import { requireResourceAccess } from "@workspace/platform/server/auth";
import { DocsHome } from "@workspace/platform/ui/docs";

export default async function DocsPage() {
  const user = await requireResourceAccess("docs");
  return <DocsHome user={user} />;
}
