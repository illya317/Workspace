import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsPlaceholderPage } from "@workspace/platform/ui/docs";

export default async function DocsExpensePage() {
  const user = await requireRouteAccess("/docs/expense");
  return <DocsPlaceholderPage user={user} title="报销规范" />;
}
