import type { SessionUser } from "@workspace/platform/types";
import WorksClient from "./WorksClient";
import type { WorkTarget } from "./types";

export function WorkTasksPageView({
  user,
  initialTarget,
  backHref = "/work/me",
}: {
  user: SessionUser;
  initialTarget: WorkTarget;
  title?: string;
  backHref?: string;
}) {
  return <WorksClient user={user} initialTarget={initialTarget} shellTitle="" shellBackHref={backHref} />;
}
