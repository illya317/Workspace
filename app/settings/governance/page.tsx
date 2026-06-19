import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { SettingsGovernancePage as PlatformSettingsGovernancePage } from "@workspace/platform/ui/settings";

export default async function SettingsGovernancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return PlatformSettingsGovernancePage({ user });
}
