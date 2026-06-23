import { createElement } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { AppShell, PortalClient } from "@workspace/platform/ui";

export default async function PortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return createElement(AppShell, {
    title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
    user,
  }, createElement(PortalClient, { user }));
}
