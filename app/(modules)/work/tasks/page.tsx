import { requireRouteAccess } from "@workspace/platform/server/auth";
import { redirect } from "next/navigation";

export default async function WorkTasksPage() {
  await requireRouteAccess("/work/tasks");
  redirect("/work/tasks/personal");
}
