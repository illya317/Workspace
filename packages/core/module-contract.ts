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
  | "assistant"
  | "projects"
  | "tasks"
  | "meetings"
  | "roster"
  | "performance"
  | "analytics"
  | "contracts"
  | "ledger"
  | "statementConfig"
  | "statements"
  | "analysis"
  | "budget"
  | "cost"
  | "tax"
  | "treasury"
  | "import"
  | "qc"
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
  resourceHidden?: boolean;
  resourceSortOrder?: number;
  pageAccess?: PageRouteAccessMode;
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
  resourceHidden?: boolean;
  resourceSortOrder?: number;
  pageAccess?: PageRouteAccessMode;
  apiPrefixes?: string[];
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
  apiPrefixes?: string[];
  sortOrder?: number;
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string;
}

export interface ApiGuardRegistration {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathPrefix: string;
  resourceKey?: string;
  migrationNote?: string;
  notes?: string;
}

export type ApiRouteAccessMode = "protected" | "public" | "dev" | "disabled" | "internal";

export interface ApiRouteRegistration {
  method: ApiGuardRegistration["method"];
  pathPrefix: string;
  access: ApiRouteAccessMode;
  resourceKey?: string;
  migrationNote?: string;
  notes?: string;
}

export type PageRouteAccessMode = "resource" | "adminManage" | "authenticated" | "public";

export interface PageRouteRegistration {
  path: string;
  access?: PageRouteAccessMode;
  resourceKey?: string;
  gatePath?: string;
  notes?: string;
}

export type PermissionContractActionKey =
  | "entry"
  | "read"
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "revise"
  | "reverse"
  | "lock"
  | "unlock"
  | "submit"
  | "approve"
  | "reject"
  | "import"
  | "export"
  | "apiUse"
  | "share"
  | "grant"
  | "configure"
  | "audit";

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
    action: PermissionContractActionKey;
  };
}

export type SpacePermissionTargetType = "personal" | "department" | "committee" | "company" | "project" | "other";
export type SpaceScopeMode = "standardBusinessSpace";
export type SpaceResourceKind = "tasks" | "projects" | "templates";

export const STANDARD_BUSINESS_SPACE_TARGET_TYPES = ["personal", "department", "committee", "company"] as const satisfies readonly SpacePermissionTargetType[];
export const STANDARD_BUSINESS_SPACE_PERMISSION_TARGET_TYPES = ["department", "committee", "company"] as const satisfies readonly SpacePermissionTargetType[];

export interface SpaceRegistration {
  key: string;
  label: string;
  entryKind: string;
  spaceResourceKind: SpaceResourceKind;
  resourceKey: string;
  app: {
    moduleKey: string;
    childKey: string;
    defaultLevel: "L3";
  };
  api: {
    permissionsPathTemplate: string;
  };
  scopeMode?: SpaceScopeMode;
  targetTypes?: SpacePermissionTargetType[];
  permissionTargetTypes?: SpacePermissionTargetType[];
  naturalManagerSources?: Partial<Record<SpacePermissionTargetType, string[]>>;
  notes?: string;
}

export interface WorkspacePackageRegistration {
  packageName: string;
  layer: WorkspaceLayer;
  moduleDef?: ModuleRegistration;
  resourceDefs?: ResourceRegistration[];
  routes?: Array<string | PageRouteRegistration>;
  apiGuards?: ApiGuardRegistration[];
  apiRoutes?: ApiRouteRegistration[];
  fkRegistrations?: FkRegistryRegistration[];
  spaceRegistrations?: SpaceRegistration[];
}
