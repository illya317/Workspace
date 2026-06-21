import { requireResourceAccess } from "@workspace/platform/server/auth";
import { DocsPositionsIndex } from "@workspace/platform/ui/docs";

export default async function DocsPositionsPage() {
  const user = await requireResourceAccess("docs.positions");
  return <DocsPositionsIndex user={user} />;
}
