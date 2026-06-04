import { requireResourceAccess } from "@/server/auth/guard";
import AppShell from "@/app/components/AppShell";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireResourceAccess("library");
  const canWriteLibrary = user.visibleWriteResourceKeys?.includes("library.write") ?? false;

  return (
    <AppShell title={ROOT_LABEL} backHref="/portal" user={user}>
      <LibraryClient rootLabel={ROOT_LABEL} canWrite={canWriteLibrary} />
    </AppShell>
  );
}
