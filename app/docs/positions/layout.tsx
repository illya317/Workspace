import { requireResourceAccess } from "@/server/auth/guard";

export default async function PositionsLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("docs.positions");
  return children;
}
