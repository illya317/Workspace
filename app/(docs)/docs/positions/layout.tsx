import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function PositionsLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/docs/positions");
  return children;
}
