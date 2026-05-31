import { requireResourceAccess } from "@/server/auth/guard";

export default async function ApiGuideLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("system.api");
  return children;
}
