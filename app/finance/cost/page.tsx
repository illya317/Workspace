import { requireFinanceAccess } from "@/server/auth/session";
import FinanceCostClient from "./FinanceCostClient";

export default async function FinanceCostPage() {
  const user = await requireFinanceAccess();
  return <FinanceCostClient user={user} />;
}
