import type { SessionUser } from "@workspace/platform/types";
import MeetingsPage from "./MeetingsPage";

export function renderMeetingsModulePage({ user, canCreate }: { user: SessionUser; canCreate: boolean }) {
  return <MeetingsPage user={user} canCreate={canCreate} />;
}
