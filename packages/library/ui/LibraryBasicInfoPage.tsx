import { authorize, evaluatePermissionAction } from "@workspace/platform/server/auth";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

interface Props {
  user: SessionUser;
}

export default async function LibraryBasicInfoPage({ user }: Props) {
  const [canWrite, canArchive, canImport, canExport, canAdmin] = await Promise.all([
    authorize({ user, resourceKey: "library.basicInfo", action: "write" }),
    evaluatePermissionAction(user.id, "library.basicInfo", "archive"),
    evaluatePermissionAction(user.id, "library.basicInfo", "import"),
    evaluatePermissionAction(user.id, "library.basicInfo", "export"),
    authorize({ user, resourceKey: "library.basicInfo", action: "admin" }),
  ]);

  return renderAppShellPage({
    title: ROOT_LABEL,
    backHref: "/portal",
    user,
    children: <LibraryClient
      canWrite={canWrite}
      canArchive={canArchive}
      canImport={canImport}
      canExport={canExport}
      canAdmin={canAdmin}
    />,
  });
}
