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
  | "settings"
  | "projects"
  | "tasks"
  | "meetings"
  | "roster"
  | "performance"
  | "analytics"
  | "contracts"
  | "ledger"
  | "statementConfig"
  | "statementReview"
  | "statements"
  | "analysis"
  | "budget"
  | "cost"
  | "tax"
  | "treasury"
  | "import"
  | "qcBatches"
  | "investors"
  | "users"
  | "suppliers"
  | "positions"
  | "company"
  | "expense"
  | "basicInfo"
  | "account"
  | "shieldCheck"
  | "api"
  | "ui";

export interface SubModuleRegistration {
  key: string;
  label: string;
  desc: string;
  href: string;
  iconKey: ModuleIconKey;
  color: ModuleColor;
  resourceKey: string;
  resourceMaxRoleKey?: "access" | "write" | "delete" | "admin";
  resourceHidden?: boolean;
  resourceSortOrder?: number;
  apiPrefixes?: string[];
  noApiReason?: string;
  lifecycleStatus?: ModuleLifecycleStatus;
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string;
}

export interface ModuleRegistration {
  key: string;
  label: string;
  desc: string;
  href: string;
  iconKey: ModuleIconKey;
  color: ModuleColor;
  presentation?: "page" | "headless";
  noPageReason?: string;
  resourceKey?: string;
  resourceMaxRoleKey?: "access" | "write" | "delete" | "admin";
  resourceHidden?: boolean;
  resourceSortOrder?: number;
  lifecycleStatus?: ModuleLifecycleStatus;
  children?: SubModuleRegistration[];
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string;
}

export type SubModuleDef = SubModuleRegistration;

export interface ModuleDef extends Omit<ModuleRegistration, "iconKey" | "children"> {
  icon: ReactNode;
  children?: SubModuleDef[];
}

export interface ResourceRegistration {
  key: string;
  name: string;
  kind?: "capability";
  capabilityOwnerKey?: string;
  parentKey?: string;
  runtimeParentKey?: string;
  maxRoleKey?: "access" | "write" | "delete" | "admin";
  sortOrder?: number;
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string;
}

export interface ApiGuardRegistration {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathPrefix: string;
  resourceKey: string;
  action: "access" | "write" | "delete" | "admin";
}

export type ApiRouteAccessMode = "protected" | "public" | "dev" | "disabled" | "internal";

export interface ApiRouteRegistration {
  method: ApiGuardRegistration["method"];
  pathPrefix: string;
  access: ApiRouteAccessMode;
  resourceKey?: string;
  action?: ApiGuardRegistration["action"];
}

export interface FkRegistryRegistration {
  key: string;
  scope: string;
  source: {
    entity: string;
    field: string;
  };
  target: string;
  targetLabel?: string;
  nullable: boolean;
  updatePolicy?: "allowed" | "readonly";
  targetDeletePolicy?: "block" | "setNull" | "cascade";
  targetArchivePolicy?: "block" | "setNull" | "cascade";
  defaultLifecycleScope?: "active" | "all" | "archived";
  permission: {
    resourceKey: string;
    action: ApiGuardRegistration["action"];
  };
}

export interface WorkspacePackageRegistration {
  packageName: string;
  layer: WorkspaceLayer;
  moduleDef?: ModuleRegistration;
  resourceDefs?: ResourceRegistration[];
  routes?: string[];
  apiGuards?: ApiGuardRegistration[];
  apiRoutes?: ApiRouteRegistration[];
  fkRegistrations?: FkRegistryRegistration[];
}
