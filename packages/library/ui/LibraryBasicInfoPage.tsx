import { createElement } from "react";
import { authorize } from "@workspace/platform/server/auth";
import type { SessionUser } from "@workspace/platform/types";
import { AppShell } from "@workspace/platform/ui";
import LibraryClient from "./LibraryClient";

const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

interface Props {
  user: SessionUser;
}

export default async function LibraryBasicInfoPage({ user }: Props) {
  const [canWrite, canDelete, canAdmin] = await Promise.all([
    authorize({ user, resourceKey: "library.basicInfo.write", action: "write" }),
    authorize({ user, resourceKey: "library.basicInfo.write", action: "delete" }),
    authorize({ user, resourceKey: "library.basicInfo.write", action: "admin" }),
  ]);

  return createElement(
    AppShell,
    { title: ROOT_LABEL, backHref: "/portal", user },
    <LibraryClient
      canWrite={canWrite}
      canDelete={canDelete}
      canAdmin={canAdmin}
    />,
  );
}
