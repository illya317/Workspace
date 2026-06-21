import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { SettingsAccountPage as PlatformSettingsAccountPage } from "@workspace/platform/ui/settings";

export default async function SettingsAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return PlatformSettingsAccountPage({ user });
}
