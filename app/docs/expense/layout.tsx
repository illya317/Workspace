import { requireResourceAccess } from "@/server/auth/guard";

export default async function ExpenseLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.expense");
  return children;
}
