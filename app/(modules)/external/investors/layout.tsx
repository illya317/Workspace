import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function InvestorsLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/external/investors");
  return children;
}
