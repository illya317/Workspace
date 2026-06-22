import type { ModuleDef, ModuleRegistration, SubModuleDef } from "@workspace/core";
import type { SessionUser } from "./types";
import { moduleIcons } from "./icons";
import { workspacePackages } from "./modules";

function toModuleDef(moduleDef: ModuleRegistration): ModuleDef {
  return {
    ...moduleDef,
    icon: moduleIcons[moduleDef.iconKey],
    children: moduleDef.children?.filter((child) => child.enabled !== false && !child.hidden) as SubModuleDef[] | undefined,
  };
}

export const MODULES: ModuleDef[] = workspacePackages
  .map((pkg) => pkg.moduleDef)
  .filter((moduleDef): moduleDef is ModuleRegistration => Boolean(moduleDef))
  .filter((moduleDef) => moduleDef.presentation !== "headless")
  .filter((moduleDef) => moduleDef.enabled !== false && !moduleDef.hidden)
  .map(toModuleDef);

function isResourceVisible(user: SessionUser, resourceKey?: string, moduleKey?: string): boolean {
  void moduleKey;
  if (resourceKey) {
    return (user.visibleResourceKeys || []).includes(resourceKey);
  }
  return true;
}

export function getAccessibleModules(user: SessionUser): ModuleDef[] {
  return MODULES.filter((m) => {
    if (isResourceVisible(user, m.resourceKey, m.key)) return true;
    if (m.children?.length) {
      return m.children.some((c) => isResourceVisible(user, c.resourceKey, m.key));
    }
    return false;
  });
}

export function getSubModules(user: SessionUser, moduleKey: string): SubModuleDef[] {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod?.children) return [];
  return mod.children.filter((c) => isResourceVisible(user, c.resourceKey, mod.key));
}

export function getEmptyMessage(_moduleKey: string): string {
  return "暂无可用模块，请联系管理员开通权限";
}

if (typeof window === "undefined") {
  for (const m of MODULES) {
    if (!m.resourceKey && m.key !== "settings") {
      console.error(`[module-nav] ${m.key}: 缺少 resourceKey，将全员可见`);
    }
    for (const c of m.children || []) {
      if (!c.resourceKey) console.error(`[module-nav] ${m.key}.${c.key}: 缺少 resourceKey，将全员可见`);
    }
  }
}

export type { ModuleDef, SubModuleDef };
