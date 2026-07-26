import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import WorkAccountSettingsClient, { type WorkAccountSettingsClientProps } from "./WorkAccountSettingsClient";

export function renderWorkAccountSettingsRoutePage({
  user,
  apiAccessModules,
}: {
  user: SessionUser;
  apiAccessModules: WorkAccountSettingsClientProps["apiAccessModules"];
}) {
  return renderAppShellPage({
    title: "账号与接入",
    backHref: "/settings",
    user,
    children: <WorkAccountSettingsClient user={user} apiAccessModules={apiAccessModules} />,
  });
}
