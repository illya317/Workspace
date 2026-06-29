"use client";

import { workspacePath } from "@workspace/core/routing";
import { ModuleCard, ModuleGridPage } from "@workspace/core/ui";
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

  if (children.length === 0) {
    return (
      <ModuleGridPage title={module.label}>
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
          {getModuleEmptyMessage(module)}
        </div>
      </ModuleGridPage>
    );
  }

  return (
    <ModuleGridPage title={module.label}>
      {children.map((child) => {
        const lifecycleStatus = child.lifecycleStatus || MODULE_LIFECYCLE_BY_RESOURCE[child.resourceKey];
        return (
          <ModuleCard
            key={child.key}
            title={child.label}
            description={child.desc}
            icon={moduleIcons[child.iconKey]}
            color={child.color}
            href={workspacePath(child.href)}
            badge={lifecycleStatus && lifecycleStatus !== "workspace-owned" ? MODULE_LIFECYCLE_LABELS[lifecycleStatus] : undefined}
          />
        );
      })}
    </ModuleGridPage>
  );
}
