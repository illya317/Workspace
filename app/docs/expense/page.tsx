import { requireAuth } from "@workspace/platform/server/auth";
import { DocsPlaceholderPage } from "@workspace/platform/ui/docs";

export default async function DocsExpensePage() {
  const user = await requireAuth();
  return <DocsPlaceholderPage user={user} title="报销规范" description="报销流程与标准将在此发布。" />;
}
