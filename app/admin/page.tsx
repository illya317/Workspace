import { requireAdminManageAccess } from "@/server/auth/guard";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const user = await requireAdminManageAccess();
  return <AdminClient user={user} />;
}
