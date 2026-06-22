import { requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsApiPage as PlatformSettingsApiPage } from "@workspace/platform/ui/settings";

export default async function SettingsHrGeneratedApiPage() {
  const user = await requireRouteAccess("/settings/api/hr-generated");
  return PlatformSettingsApiPage({ user, focusRegistrationKey: "hr.generated" });
}
