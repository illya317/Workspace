import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { SettingsApiPage as PlatformSettingsApiPage } from "@workspace/settings/ui/settings";

export default async function SettingsApiPage() {
  const user = await requireRouteAccess("/settings/api");
  const [canCreateClient, canRotateSecret, canGrantScopes, canAccessNotifications] = await Promise.all([
    evaluatePermissionAction(user.id, "settings.api.manage", "create"),
    evaluatePermissionAction(user.id, "settings.api.manage", "revise"),
    evaluatePermissionAction(user.id, "settings.api.manage", "grant"),
    evaluatePermissionAction(user.id, "settings.notifications", "read"),
  ]);
  return PlatformSettingsApiPage({ user, canCreateClient, canRotateSecret, canGrantScopes, canAccessNotifications });
}
