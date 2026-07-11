import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function ExpenseLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/docs/expense");
  return children;
}
