export interface WorkUser {
  id: number;
  name?: string | null;
  visibleResourceKeys?: string[];
  visibleWriteResourceKeys?: string[];
  isAdmin?: boolean;
  company?: string | null;
}

export function workCanEdit(user: WorkUser) {
  if (user.isAdmin) return true;
  const keys = user.visibleWriteResourceKeys || [];
  return keys.includes("work.projects");
}

export function workCanAccessProjects(user: WorkUser) {
  if (user.isAdmin) return true;
  const keys = user.visibleResourceKeys || [];
  return keys.includes("work.projects");
}

export function workCanCreateOrgProject(user: WorkUser) {
  if (user.isAdmin) return true;
  const keys = user.visibleWriteResourceKeys || [];
  return keys.includes("work.projects.createOrg");
}

export interface FKFieldConfig {
  entity: string;
  fkKey?: string;
  displayField: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  editable?: boolean;
  required?: boolean;
  type?: "text" | "textarea" | "number" | "date" | "fk" | "boolean";
}

export interface TabConfig {
  title: string;
  apiPath: string;
  entityType: string;
  fields: FieldConfig[];
  fkFields?: Record<string, FKFieldConfig>;
  canCreate?: boolean;
  canDelete?: boolean;
  listGetter: (data: unknown) => unknown[];
  buildCreateBody?: (form: Record<string, unknown>) => Record<string, unknown>;
}
