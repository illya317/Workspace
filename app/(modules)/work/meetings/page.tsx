import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";
import { renderMeetingsModulePage } from "@workspace/work/ui";

export default createProtectedModulePage({
  route: "/work/meetings",
  title: "会议管理",
  backHref: "/work",
  render: renderMeetingsModulePage,
});
