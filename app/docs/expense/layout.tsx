import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function ExpenseLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.expense");
  return children;
}
