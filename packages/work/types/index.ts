export interface WorkUser {
  id: number;
  name?: string | null;
  isAdmin?: boolean;
  company?: string | null;
}

export interface WorkProjectActionPermissions {
  canCreate: boolean;
  canCreateOrg: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
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
