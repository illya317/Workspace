import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import LibraryClient from "./LibraryClient";

interface Props {
  user: SessionUser;
  title?: string;
  canUpdate: boolean;
  canArchive: boolean;
  canImport: boolean;
  canExport: boolean;
  canConfigure: boolean;
}

export default function LibraryBasicInfoPage({
  user,
  title = "资料库",
  canUpdate,
  canArchive,
  canImport,
  canExport,
  canConfigure,
}: Props) {
  return renderAppShellPage({
    title,
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
