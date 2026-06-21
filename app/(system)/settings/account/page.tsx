import { requireResourceAccess } from "@workspace/platform/server/auth";
import { SettingsAccountPage as PlatformSettingsAccountPage } from "@workspace/platform/ui/settings";

export default async function SettingsAccountPage() {
  const user = await requireResourceAccess("settings.account");

  return PlatformSettingsAccountPage({ user });
}
