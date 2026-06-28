import type { SessionUser } from "@workspace/platform/types";
import MeetingsPage from "./MeetingsPage";

export function renderMeetingsModulePage({ user }: { user: SessionUser }) {
  return <MeetingsPage user={user} />;
}
