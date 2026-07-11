import { authorize } from "@workspace/platform/server/auth";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

interface Props {
  user: SessionUser;
}

export default async function LibraryBasicInfoPage({ user }: Props) {
  const [canUpdate, canArchive, canImport, canExport, canConfigure] = await Promise.all([
    authorize({ user, resourceKey: "library.basicInfo", action: "update" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "archive" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "import" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "export" }),
    authorize({ user, resourceKey: "library.basicInfo", action: "configure" }),
  ]);

  return renderAppShellPage({
    title: ROOT_LABEL,
    backHref: "/portal",
    user,
    children: <LibraryClient
      canUpdate={canUpdate}
      canArchive={canArchive}
      canImport={canImport}
      canExport={canExport}
      canConfigure={canConfigure}
    />,
  });
}
