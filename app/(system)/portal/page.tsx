import { requireAuth } from "@workspace/platform/server/auth";
import { getUserPortalSlots } from "@workspace/platform/server/user-preferences";
import { renderPortalPage } from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export default async function PortalPage() {
  const user = await requireAuth();
  const initialPortalSlots = await getUserPortalSlots(user.id, user.visibleResourceKeys ?? []);

  return renderAppShellPage({
    title: getTenantProfile().identity.appName,
    initialPortalSlots,
    user,
    children: renderPortalPage({ user, initialSlots: initialPortalSlots }),
  });
}
