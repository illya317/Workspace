import { redirect } from "next/navigation";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { SettingsGovernanceToolbarPreviewPage as PlatformSettingsGovernanceToolbarPreviewPage } from "@workspace/platform/ui/settings";

export default async function SettingsGovernanceToolbarPreviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return PlatformSettingsGovernanceToolbarPreviewPage({ user });
}
