import { requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsUiPage as PlatformSettingsUiPage } from "@workspace/platform/ui/settings";

export default async function SettingsUiRoutePage() {
  const user = await requireRouteAccess("/settings/ui");
  return <PlatformSettingsUiPage user={user} />;
}
