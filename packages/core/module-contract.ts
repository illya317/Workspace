import type { ReactNode } from "react";

export type WorkspaceLayer = "core" | "platform" | "domain";

export type ModuleLifecycleStatus =
  | "workspace-owned"
  | "external-system"
  | "workspace-analysis"
  | "legacy-fallback"
  | "deprecated";

export type ModuleColor =
  | "emerald"
  | "blue"
  | "indigo"
  | "purple"
  | "amber"
  | "cyan"
  | "orange";

export type ModuleIconKey =
  | "reports"
  | "hr"
  | "admin"
  | "docs"
  | "finance"
  | "production"
  | "customers"
  | "library"
  | "settings";

export interface SubModuleRegistration {
  key: string;
  label: string;
  desc: string;
  href: string;
  resourceKey: string;
  lifecycleStatus?: ModuleLifecycleStatus;
}

export interface ModuleRegistration {
  key: string;
  label: string;
  desc: string;
  href: string;
  iconKey: ModuleIconKey;
  color: ModuleColor;
  resourceKey?: string;
  lifecycleStatus?: ModuleLifecycleStatus;
  children?: SubModuleRegistration[];
}

export type SubModuleDef = SubModuleRegistration;

export interface ModuleDef extends Omit<ModuleRegistration, "iconKey" | "children"> {
  icon: ReactNode;
  children?: SubModuleDef[];
}

export interface ResourceRegistration {
  key: string;
  name: string;
  parentKey?: string;
  maxRoleKey?: "access" | "write" | "delete" | "admin";
  sortOrder?: number;
}

export interface ApiGuardRegistration {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathPrefix: string;
  resourceKey: string;
  action: "access" | "write" | "delete" | "admin";
}

export interface WorkspacePackageRegistration {
  packageName: string;
  layer: WorkspaceLayer;
  moduleDef?: ModuleRegistration;
  resourceDefs?: ResourceRegistration[];
  routes?: string[];
  apiGuards?: ApiGuardRegistration[];
}
