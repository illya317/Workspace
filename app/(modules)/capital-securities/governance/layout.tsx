import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function GovernanceLayout({ children }: { children: React.ReactNode }) {
  await requireRouteAccess("/capital-securities/governance");
  return children;
}
