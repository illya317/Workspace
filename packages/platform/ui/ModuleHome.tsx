"use client";

import { workspacePath } from "@workspace/core/routing";
import { createBlockSurfaceSection, createModuleGridSection, createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import {
  MODULE_LIFECYCLE_BY_RESOURCE,
  MODULE_LIFECYCLE_LABELS,
} from "../module-lifecycle";
import { getModuleEmptyMessage, getSubModules, type ModuleDef } from "../module-nav";
import { moduleIcons } from "../icons";


interface Props {
  module: ModuleDef;
  user: SessionUser;
}

/** L1 模块首页，图标风格与 L0 Portal 一致 */
export default function ModuleHome({ module, user }: Props) {
  const children = getSubModules(user, module.key);

  return (
    <PageSurface
      kind="directory"
      body={createPageBody(children.length === 0
        ? [createSectionSection("empty-module", {
            title: module.label,
            sections: [createBlockSurfaceSection("empty", {
              kind: "empty",
              content: getModuleEmptyMessage(module)
            })],
          })]
        : [createModuleGridSection("module-grid", {

            title: module.label,
            items: children.map((child) => {
              const lifecycleStatus = child.lifecycleStatus || MODULE_LIFECYCLE_BY_RESOURCE[child.resourceKey];
              return {
                key: child.key,
                title: child.label,
                description: child.desc,
                icon: moduleIcons[child.iconKey],
                color: child.color,
                href: workspacePath(child.href),
                badge: lifecycleStatus && lifecycleStatus !== "workspace-owned" ? MODULE_LIFECYCLE_LABELS[lifecycleStatus] : undefined,
              };
            }),
          })])}
    />
  );
}
