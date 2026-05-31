import { requireResourceAccess } from "@/server/auth/guard";

export default async function InvestorsLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.investor");
  return children;
}
