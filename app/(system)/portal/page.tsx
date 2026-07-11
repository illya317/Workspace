import { createAuthenticatedAppShellPage } from "@workspace/platform/ui/protected-page";
import { renderPortalPage } from "@workspace/platform/ui";

export default createAuthenticatedAppShellPage({
  title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
  render: renderPortalPage,
});
