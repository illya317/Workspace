import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.company");
  return children;
}
