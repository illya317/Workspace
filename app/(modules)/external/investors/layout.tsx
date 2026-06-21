import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function InvestorsLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.investors");
  return children;
}
