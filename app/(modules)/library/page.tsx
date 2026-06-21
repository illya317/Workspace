import { requireResourceAccess } from "@workspace/platform/server/auth";
import { authorize } from "@workspace/platform/server/auth";
import { AppShell } from "@workspace/platform/ui";
import { LibraryClient } from "@workspace/library/ui";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireResourceAccess("library");
  const [canWrite, canDelete, canAdmin] = await Promise.all([
    authorize({ user, resourceKey: "library.write", action: "write" }),
    authorize({ user, resourceKey: "library.write", action: "delete" }),
    authorize({ user, resourceKey: "library.write", action: "admin" }),
  ]);

  return (
    <AppShell title={ROOT_LABEL} backHref="/portal" user={user}>
      <LibraryClient
        canWrite={canWrite}
        canDelete={canDelete}
        canAdmin={canAdmin}
      />
    </AppShell>
  );
}
