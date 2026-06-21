import { requireResourceAccess } from "@workspace/platform/server/auth";
import { SettingsGovernanceToolbarPreviewPage as PlatformSettingsGovernanceToolbarPreviewPage } from "@workspace/platform/ui/settings";

export default async function SettingsGovernanceToolbarPreviewPage() {
  const user = await requireResourceAccess("settings.governance");

  return PlatformSettingsGovernanceToolbarPreviewPage({ user });
}
