import { createElement } from "react";
import { PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import AppShell from "../AppShell";

type Props = {
  reason: string;
  resourceKey?: string;
  user: SessionUser;
};

export function ModuleDisabledPageView({ reason, resourceKey, user }: Props) {
  return createElement(
    AppShell,
    { title: "模块未启用", backHref: "/portal", user },
    <PageSurface
      kind="settings"
      contentClassName="py-10"
      blocks={[{
        kind: "section",
        key: "disabled",
        title: "模块未启用",
        subtitle: resourceKey ? `资源：${resourceKey}` : undefined,
        blocks: [{ kind: "empty", key: "reason", content: reason }],
      }]}
    />,
  );
}
