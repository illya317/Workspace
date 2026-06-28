import { createBlockSurfaceBlock, createPageBody, createSectionBlock, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { renderAppShellPage } from "../app-shell-page";

type Props = {
  reason: string;
  resourceKey?: string;
  user: SessionUser;
};

export function ModuleDisabledPageView({ reason, resourceKey, user }: Props) {
  return renderAppShellPage({
    title: "模块未启用",
    backHref: "/portal",
    user,
    children: <PageSurface
      kind="settings"
      contentClassName="py-10"
      body={createPageBody([createSectionBlock("disabled", {
        title: "模块未启用",
        subtitle: resourceKey ? `资源：${resourceKey}` : undefined,
        blocks: [createBlockSurfaceBlock("reason", {
          kind: "empty",
          content: reason
        })],
      })])}
    />,
  });
}
