import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsEditorTemplateDetailPage } from "@workspace/platform/ui/docs";

export default async function DocsEditorTemplateDetailRoute({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const user = await requireRouteAccess("/docs/editor");
  return DocsEditorTemplateDetailPage({ templateId: decodeURIComponent(templateId), user });
}
