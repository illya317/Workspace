import { createElement } from "react";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { LibraryBasicInfoPage } from "@workspace/library/ui";

export const dynamic = "force-dynamic";

export default async function LibraryBasicInfoRoutePage() {
  const user = await requireRouteAccess("/library/basic-info");
  return createElement(LibraryBasicInfoPage, { user });
}
