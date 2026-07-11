import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/external/customers");
  return children;
}
