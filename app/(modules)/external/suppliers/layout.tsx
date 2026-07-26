import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/external/suppliers");
  return children;
}
