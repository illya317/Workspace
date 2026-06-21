import { requireResourceAccess } from "@workspace/platform/server/auth";

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("external.customer");
  return children;
}
