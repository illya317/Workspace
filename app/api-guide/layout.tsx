import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function ApiGuideLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("system.api");
  return children;
}
