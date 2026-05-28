import { requireFinanceCostAccess } from "@/server/auth/session";
import FinanceCostClient from "./FinanceCostClient";

export default async function FinanceCostPage() {
  const user = await requireFinanceCostAccess();
  return <FinanceCostClient user={user} />;
}
