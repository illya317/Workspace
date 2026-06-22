import { requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsApiPage as PlatformSettingsApiPage } from "@workspace/platform/ui/settings";

export default async function SettingsApiPage() {
  const user = await requireRouteAccess("/settings/api");
  return PlatformSettingsApiPage({ user });
}
