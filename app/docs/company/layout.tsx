import { requireResourceAccess } from "@/server/auth/guard";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.company");
  return children;
}
