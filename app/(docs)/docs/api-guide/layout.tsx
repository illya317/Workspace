import { requireAnyResourceAccess } from "@workspace/platform/server/auth";

export default async function DocsApiGuideLayout({ children }: { children: React.ReactNode }) {
  await requireAnyResourceAccess(["docs.api", "settings.api"]);
  return children;
}
