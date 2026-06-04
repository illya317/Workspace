import { requireResourceAccess } from "@/server/auth/guard";
import { checkPermission } from "@/server/rbac/check";
import AppShell from "@/app/components/AppShell";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireResourceAccess("library");
  const [canWrite, canDelete, canAdmin] = await Promise.all([
    checkPermission(user.id, "library.write", "write"),
    checkPermission(user.id, "library.write", "delete"),
    checkPermission(user.id, "library.write", "admin"),
  ]);

  return (
    <AppShell title={ROOT_LABEL} backHref="/portal" user={user}>
      <LibraryClient
        rootLabel={ROOT_LABEL}
        canWrite={canWrite}
        canDelete={canDelete}
        canAdmin={canAdmin}
      />
    </AppShell>
  );
}
