import { redirect } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";

export default async function ProductionQcPage() {
  const user = await requireResourceAccess("production.qc");
  const visible = user.visibleResourceKeys || [];

  if (visible.includes("production.qc.batches")) redirect("/production/qc/batches");
  if (visible.includes("production.qc.templates")) redirect("/production/qc/templates");
  redirect("/production");
}
