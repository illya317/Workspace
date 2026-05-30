import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import HRClient from "../HRClient";

export default async function HRRosterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessHR) redirect("/portal");
  return <HRClient user={user} />;
}
