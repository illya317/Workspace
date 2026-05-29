import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.canAccessFinance) redirect("/portal");
  return <ImportClient user={user} />;
}
