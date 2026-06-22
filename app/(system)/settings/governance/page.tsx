import { requireResourceAccess } from "@workspace/platform/server/auth";
import { SettingsGovernancePage as PlatformSettingsGovernancePage } from "@workspace/platform/ui/settings";

export default async function SettingsGovernancePage() {
  const user = await requireResourceAccess("settings.governance");

  return PlatformSettingsGovernancePage({ user });
}
