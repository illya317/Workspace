import { requireAuth } from "@/server/auth/session";
import { DocsPositionsIndex } from "@workspace/platform/ui/docs";

export default async function DocsPositionsPage() {
  const user = await requireAuth();
  return <DocsPositionsIndex user={user} />;
}
