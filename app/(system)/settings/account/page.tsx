import { requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsAccountPage as PlatformSettingsAccountPage } from "@workspace/platform/ui/settings";

export default async function SettingsAccountPage() {
  const user = await requireRouteAccess("/settings/account");

  return PlatformSettingsAccountPage({ user });
}
