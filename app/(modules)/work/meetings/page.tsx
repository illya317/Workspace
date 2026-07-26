import { redirect } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function WorkMeetingsPage() {
  await requireRouteAccess("/work/meeting");
  redirect("/work/meeting");
}
