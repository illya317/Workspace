import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import type { SessionUser } from "@workspace/platform/types";
import WorksClient from "./WorksClient";
import type { WorkTarget } from "./types";

export function WorkTasksPageView({
  user,
  initialTarget,
}: {
  user: SessionUser;
  initialTarget: WorkTarget;
}) {
  return renderAppShellPage({
    title: "工作计划",
    backHref: "/work",
    user,
    children: <WorksClient user={user} initialTarget={initialTarget} />,
  });
}
