import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getCoreUiRegistryUsageRows } from "@workspace/platform/server/ui-registry";
import { SettingsGovernanceUiRegistryPage as PlatformSettingsGovernanceUiRegistryPage } from "@workspace/platform/ui/settings";

export default async function SettingsGovernanceUiRegistryPage() {
  const user = await requireResourceAccess("settings.governance");

  const coreUiRegistryRows = getCoreUiRegistryUsageRows();

  return PlatformSettingsGovernanceUiRegistryPage({ user, coreUiRegistryRows });
}
