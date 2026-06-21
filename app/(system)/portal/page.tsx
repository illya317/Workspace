import { createElement } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { PortalClient } from "@workspace/platform/ui";

export default async function PortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return createElement(PortalClient, { user });
}
