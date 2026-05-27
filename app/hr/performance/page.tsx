import { requireHRAccess } from "@/server/auth/session";
import HRPerformanceClient from "./HRPerformanceClient";

export default async function HRPerformancePage() {
  const user = await requireHRAccess();
  return <HRPerformanceClient user={user} />;
}
