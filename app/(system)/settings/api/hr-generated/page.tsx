import { requireResourceAccess } from "@workspace/platform/server/auth";
import { SettingsApiPage as PlatformSettingsApiPage } from "@workspace/platform/ui/settings";

export default async function SettingsHrGeneratedApiPage() {
  const user = await requireResourceAccess("settings.api");
  return PlatformSettingsApiPage({ user, focusRegistrationKey: "hr.generated" });
}
