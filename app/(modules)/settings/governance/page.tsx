import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsGovernancePage } from "@workspace/settings/ui/settings";

export default async function SettingsGovernanceRoutePage() {
  const user = await requireRouteAccess("/settings/governance");
  const canAuditOperations = await evaluatePermissionAction(user.id, "settings.governance", "audit");
  return SettingsGovernancePage({ user, canAuditOperations });
}
