import { createAuthenticatedAppShellPage } from "@workspace/platform/server/protected-page";
import { renderPortalPage } from "@workspace/platform/ui";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export default createAuthenticatedAppShellPage({
  title: getTenantProfile().identity.appName,
  render: renderPortalPage,
});
