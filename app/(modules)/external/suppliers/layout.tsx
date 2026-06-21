import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.supplier");
  return children;
}
