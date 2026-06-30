import { requireRouteAccess } from "@workspace/platform/server/auth";
import { DocsEditorPage } from "@workspace/platform/ui/docs";

export default async function Page() {
  const user = await requireRouteAccess("/docs/editor");
  return DocsEditorPage({ user });
}
