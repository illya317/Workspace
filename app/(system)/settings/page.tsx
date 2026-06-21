import { createElement } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { SettingsRootPageView } from "@workspace/platform/ui/system/SystemPages";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return createElement(SettingsRootPageView, { user });
}
