import { requireResourceAccess } from "@/server/auth/guard";

export default async function SchedulesLayout({ children }: { children: React.ReactNode }) {
  await requireResourceAccess("finance.schedules");
  return children;
}
