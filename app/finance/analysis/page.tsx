import { requireFinanceAccess } from "@/server/auth/session";
import FinanceAnalysisClient from "./FinanceAnalysisClient";

export default async function FinanceAnalysisPage() {
  const user = await requireFinanceAccess();
  return <FinanceAnalysisClient user={user} />;
}
