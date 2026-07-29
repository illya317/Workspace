import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function DocsEditorLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/docs/editor");
  return children;
}
