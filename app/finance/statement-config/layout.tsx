import { requireResourceAccess } from "@/server/auth/guard";

export default async function StatementConfigLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("finance.statement");
  return <>{children}</>;
}
