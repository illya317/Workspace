import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function DocsApiGuideLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("system.api");
  return children;
}
