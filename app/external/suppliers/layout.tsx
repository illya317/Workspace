import { requireResourceAccess } from "@/server/auth/guard";

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.supplier");
  return children;
}
