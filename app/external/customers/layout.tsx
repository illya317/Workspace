import { requireResourceAccess } from "@/server/auth/guard";

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.customer");
  return children;
}
