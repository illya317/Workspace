import { redirect } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";

export default async function WorkTasksPersonalPage() {
  const user = await requireRouteAccess("/work/tasks");
  redirect(`/work/tasks/personal/${user.id}`);
}
