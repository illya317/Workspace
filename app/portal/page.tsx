import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import PortalClient from "./PortalClient";

export default async function PortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <PortalClient user={user} />;
}
