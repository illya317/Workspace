import { createEmptySection, createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";

type Props = {
  reason: string;
  resourceKey?: string;
  user: SessionUser;
};

export function ModuleDisabledPageView({ reason, user }: Props) {
  return renderAppShellPage({
    title: "模块未启用",
    backHref: "/portal",
    user,
    children: <PageSurface kind="standard"
      body={createPageBody([createSectionSection("disabled", {
        title: "模块未启用",
        sections: [createEmptySection("reason", {
          content: reason
        })],
      })])}
    />,
  });
}
