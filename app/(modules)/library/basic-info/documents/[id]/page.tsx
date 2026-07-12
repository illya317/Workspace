import { notFound } from "next/navigation";

import { LibraryDocumentPageClient } from "@workspace/library/ui";
import { authorize, requireRouteAccess } from "@workspace/platform/server/auth";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function LibraryDocumentPage({ params }: Props) {
  const [{ id }, user] = await Promise.all([params, requireRouteAccess("/library/basic-info")]);
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) notFound();

  const [canUpdate, canArchive, canExport, canConfigure, canImport] = await Promise.all([
    authorize({ user, resourceKey: "library.basicInfo", action: "update" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "archive" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "export" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "configure" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "import" }),
  ]);

  return <LibraryDocumentPageClient
    documentId={documentId}
    user={user}
    canUpdate={canUpdate}
    canArchive={canArchive}
    canExport={canExport}
    canConfigure={canConfigure}
    canImport={canImport}
  />;
}
