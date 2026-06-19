import { requireAuth } from "@workspace/platform/server/auth";
import { DocsPositionsIndex } from "@workspace/platform/ui/docs";

export default async function DocsPositionsPage() {
  const user = await requireAuth();
  return <DocsPositionsIndex user={user} />;
}
