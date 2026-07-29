import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/docs/company");
  return children;
}
