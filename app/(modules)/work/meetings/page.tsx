import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import AppShell from "@workspace/platform/ui/AppShell";
import { MeetingsPage } from "@workspace/work/ui";

export default async function WorkMeetingsPage() {
  const user = await requireRouteAccess("/work/meetings");
  return createElement(AppShell, { title: "会议管理", backHref: "/work", user }, createElement(MeetingsPage, { user }));
}
