import { requireHRAccess } from "@/server/auth/session";
import HRAnalyticsClient from "./HRAnalyticsClient";

export default async function HRAnalyticsPage() {
  const user = await requireHRAccess();
  return <HRAnalyticsClient user={user} />;
}
