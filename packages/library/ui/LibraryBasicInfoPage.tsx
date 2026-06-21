import { requireResourceAccess } from "@workspace/platform/server/auth";
import { authorize } from "@workspace/platform/server/auth";
import { AppShell } from "@workspace/platform/ui";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

export default async function LibraryBasicInfoPage() {
  const user = await requireResourceAccess("library.basicInfo");
  const [canWrite, canDelete, canAdmin] = await Promise.all([
    authorize({ user, resourceKey: "library.basicInfo.write", action: "write" }),
    authorize({ user, resourceKey: "library.basicInfo.write", action: "delete" }),
    authorize({ user, resourceKey: "library.basicInfo.write", action: "admin" }),
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
