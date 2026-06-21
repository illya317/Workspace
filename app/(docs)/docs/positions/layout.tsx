import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function PositionsLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.positions");
  return children;
}
